// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { connectLiveFeed, type FeedStore, type LiveSocket } from "./feed";

class FakeSocket implements LiveSocket {
  private handler: ((d: string) => void) | null = null;
  onMessage(fn: (d: string) => void) {
    this.handler = fn;
  }
  emit(frame: unknown) {
    this.handler?.(JSON.stringify(frame));
  }
  close() {}
}

const snap = (turn: number) => ({
  version: "0", seed: 7, turn, phase: "negotiate", radius: 6, coherenceMax: 6, tiles: [], cogs: [], commons: 0,
});
const newStore = (): FeedStore => ({ snapshots: [], events: [], status: null, actPrompts: {}, messages: [] });

describe("connectLiveFeed", () => {
  it("applies snapshot frames and notifies", () => {
    const store = newStore();
    const sock = new FakeSocket();
    const onChange = vi.fn();
    connectLiveFeed(store, () => sock, onChange);
    sock.emit({ type: "snapshot", snapshot: snap(1) });
    expect(store.snapshots).toHaveLength(1);
    expect(onChange).toHaveBeenCalled();
  });
  it("drops malformed frames", () => {
    const store = newStore();
    const sock = new FakeSocket();
    connectLiveFeed(store, () => sock, () => {});
    sock.emit({ type: "bogus" });
    sock.emit("not json{");
    expect(store.snapshots).toHaveLength(0);
  });
  it("records status frames", () => {
    const store = newStore();
    const sock = new FakeSocket();
    connectLiveFeed(store, () => sock, () => {});
    sock.emit({ type: "serverStatus", status: { turn: 2, phase: "commit", finished: false, cogCount: 4 } });
    expect(store.status?.turn).toBe(2);
  });
  it("accumulates actPrompt frames per cog", () => {
    const store = newStore();
    const sock = new FakeSocket();
    connectLiveFeed(store, () => sock, () => {});
    sock.emit({ type: "actPrompt", cogId: "cog0", turn: 1, phase: "commit", content: "saw -> bid 2" });
    expect(store.actPrompts.cog0).toHaveLength(1);
    expect(store.actPrompts.cog0![0]!.content).toContain("bid 2");
  });
  it("clears history when a reset is detected (snapshot turn moves backwards)", () => {
    const store = newStore();
    const sock = new FakeSocket();
    connectLiveFeed(store, () => sock, () => {});
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
