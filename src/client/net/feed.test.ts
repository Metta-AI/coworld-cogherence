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
});
