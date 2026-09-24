import { describe, expect, it } from "vitest";

import { cogherenceGame } from "./game.js";
import { candidates } from "./choices.js";

describe("Cogherence Jev candidates", () => {
  it("does not sacrifice the only owned tile", () => {
    const state = cogherenceGame.newGame({ seed: "7", playerCount: 4, seatNames: [] });
    const view = cogherenceGame.redact(state, 0);
    expect(view.tiles.filter((tile) => tile.alignment === view.cogs[0]!.id)).toHaveLength(1);
    expect(candidates(view, 0).some((candidate) => candidate.orders.some((order) => order.type === "exploit"))).toBe(false);
    expect(candidates(view, 0).some((candidate) => candidate.key === "bid_1")).toBe(true);
  });
});
