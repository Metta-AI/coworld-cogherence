// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { connectLiveFeed, type FeedStore, type LiveSocket } from "./feed";
import type { ServerMessage } from "../../shared/protocol";

// These tests exercise connectLiveFeed's reconnect/backfill LIFECYCLE; the emitted
// frames are already cogherence ServerMessages, so a pass-through decoder stands in
// for the real @cogweb wire translator (covered in cogweb-feed.test.ts).
const identity = () => (raw: unknown): ServerMessage[] => [raw as ServerMessage];

class FakeSocket implements LiveSocket {
  private handler: ((d: string) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  closed = false;
  sent: string[] = [];
  onMessage(fn: (d: string) => void) {
    this.handler = fn;
  }
  onClose(fn: () => void) {
    this.closeHandler = fn;
  }
  send(data: string) {
    this.sent.push(data);
  }
  emit(frame: unknown) {
    this.handler?.(JSON.stringify(frame));
  }
  die() {
    this.closeHandler?.();
  }
  close() {
    this.closed = true;
  }
}

const snap = (turn: number) => ({
  version: "0", seed: 7, turn, phase: "negotiate", radius: 6, coherenceMax: 6, tiles: [], cogs: [],
});
const newStore = (): FeedStore => ({ snapshots: [], events: [], status: null, actPrompts: {}, messages: [], lobby: null });

describe("connectLiveFeed", () => {
  it("reconnects with backoff when the socket dies, wiping the store for a clean backfill", () => {
    vi.useFakeTimers();
    const store = newStore();
    const sockets: FakeSocket[] = [];
    const onChange = vi.fn();
    connectLiveFeed(store, () => {
      const sk = new FakeSocket();
      sockets.push(sk);
      return sk;
    }, onChange, identity);
    sockets[0]!.emit({ type: "snapshot", snapshot: snap(1) });
    expect(store.snapshots).toHaveLength(1);
    sockets[0]!.die(); // server restarted / never came up
    expect(sockets).toHaveLength(1); // not yet — waits out the backoff
    vi.advanceTimersByTime(600);
    expect(sockets).toHaveLength(2); // reconnected
    expect(store.snapshots).toHaveLength(0); // wiped — the new backfill repopulates
    sockets[1]!.emit({ type: "snapshot", snapshot: snap(5) });
    expect(store.snapshots.map((s) => s.turn)).toEqual([5]);
    vi.useRealTimers();
  });

  it("stops reconnecting once closed", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const { stop } = connectLiveFeed(newStore(), () => {
      const sk = new FakeSocket();
      sockets.push(sk);
      return sk;
    }, vi.fn(), identity);
    stop();
    sockets[0]!.die();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1); // no zombie reconnects after teardown
    expect(sockets[0]!.closed).toBe(true);
    vi.useRealTimers();
  });

  it("send serializes a ClientMessage onto the current live socket", () => {
    const sockets: FakeSocket[] = [];
    const { send } = connectLiveFeed(newStore(), () => {
      const sk = new FakeSocket();
      sockets.push(sk);
      return sk;
    }, vi.fn(), identity);
    send({ type: "addSeat" });
    send({ type: "start" });
    expect(sockets[0]!.sent).toEqual([JSON.stringify({ type: "addSeat" }), JSON.stringify({ type: "start" })]);
  });

  it("applies snapshot frames and notifies", () => {
    const store = newStore();
    const sock = new FakeSocket();
    const onChange = vi.fn();
    connectLiveFeed(store, () => sock, onChange, identity);
    sock.emit({ type: "snapshot", snapshot: snap(1) });
    expect(store.snapshots).toHaveLength(1);
    expect(onChange).toHaveBeenCalled();
  });
  it("a same-turn snapshot REPLACES the turn's entry — operator actions don't duplicate turns", () => {
    const store = newStore();
    const sock = new FakeSocket();
    connectLiveFeed(store, () => sock, vi.fn(), identity);
    sock.emit({ type: "snapshot", snapshot: snap(1) });
    sock.emit({ type: "snapshot", snapshot: snap(1) }); // a claim/convert/kick mid-turn
    sock.emit({ type: "snapshot", snapshot: snap(2) });
    expect(store.snapshots.map((s) => s.turn)).toEqual([1, 2]);
  });
  it("drops malformed frames", () => {
    const store = newStore();
    const sock = new FakeSocket();
    connectLiveFeed(store, () => sock, () => {}, identity);
    sock.emit({ type: "bogus" });
    sock.emit("not json{");
    expect(store.snapshots).toHaveLength(0);
  });
  it("records status frames", () => {
    const store = newStore();
    const sock = new FakeSocket();
    connectLiveFeed(store, () => sock, () => {}, identity);
    sock.emit({ type: "serverStatus", status: { turn: 2, phase: "commit", finished: false, cogCount: 4 } });
    expect(store.status?.turn).toBe(2);
  });
  it("accumulates actPrompt frames per cog", () => {
    const store = newStore();
    const sock = new FakeSocket();
    connectLiveFeed(store, () => sock, () => {}, identity);
    sock.emit({ type: "actPrompt", cogId: "cog0", turn: 1, phase: "commit", content: "saw -> bid 2" });
    expect(store.actPrompts.cog0).toHaveLength(1);
    expect(store.actPrompts.cog0![0]!.content).toContain("bid 2");
  });
  it("clears history when a reset is detected (snapshot turn moves backwards)", () => {
    const store = newStore();
    const sock = new FakeSocket();
    connectLiveFeed(store, () => sock, () => {}, identity);
    sock.emit({ type: "snapshot", snapshot: snap(1) });
    sock.emit({ type: "snapshot", snapshot: snap(2) });
    sock.emit({ type: "event", event: { type: "auction", winner: "cog0", price: 1, bids: [] }, turn: 2 });
    sock.emit({ type: "message", message: { seq: 1, turn: 2, from: "cog0", to: "public", text: "old game" } });
    expect(store.snapshots).toHaveLength(2);
    // operator reset -> server re-broadcasts from turn 1 over the same socket
    sock.emit({ type: "snapshot", snapshot: snap(1) });
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0]!.turn).toBe(1);
    expect(store.events).toHaveLength(0); // abandoned game's events dropped
    expect(store.messages).toHaveLength(0); // and its chat
  });
});
