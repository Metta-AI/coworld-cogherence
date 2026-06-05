import { describe, it, expect } from "vitest";
import { newGame } from "./engine/game";
import { toSnapshot } from "./snapshot";
import { gameSnapshotSchema, serverMessageSchema, serverStatusSchema, turnEventSchema } from "./protocol";

describe("protocol", () => {
  it("validates a real snapshot", () =>
    expect(() => gameSnapshotSchema.parse(toSnapshot(newGame(7, 4)))).not.toThrow());
  it("wraps a snapshot in a ServerMessage", () =>
    expect(serverMessageSchema.parse({ type: "snapshot", snapshot: toSnapshot(newGame(7, 4)) }).type).toBe("snapshot"));
  it("validates each engine event variant", () => {
    expect(() => turnEventSchema.parse({ type: "auction", winner: "cog0", price: 3, bids: [["cog0", 4]] })).not.toThrow();
    expect(() => turnEventSchema.parse({ type: "mint", cog: "cog0", gained: { C: 1, O: 0, Ge: 0, S: 2 } })).not.toThrow();
    expect(() => turnEventSchema.parse({ type: "capture", tile: "0,0", from: null, to: "cog1", coherence: 2 })).not.toThrow();
  });
  it("rejects an unknown message type", () =>
    expect(() => serverMessageSchema.parse({ type: "nope" })).toThrow());
  it("validates an actPrompt frame", () =>
    expect(() =>
      serverMessageSchema.parse({ type: "actPrompt", cogId: "cog0", turn: 3, phase: "commit", content: "saw X -> bid 2" }),
    ).not.toThrow());
  it("serverStatus carries phase/pending/done/deadline", () => {
    expect(() =>
      serverStatusSchema.parse({
        turn: 3, phase: "commit", finished: false, cogCount: 4, clientCount: 1,
        pending: ["cog0"], done: ["cog1", "cog2", "cog3"], phaseDeadlineAt: 1000,
      }),
    ).not.toThrow();
  });
});
