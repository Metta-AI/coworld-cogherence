import { describe, it, expect } from "vitest";
import { OrderSchema, isOwn, isLegalAlignTarget, alignDistance } from "./orders";
import type { GameState, Tile, CogId } from "./types";
import { emptyTreasury } from "./types";
import { key } from "./hex";

const tile = (q: number, r: number, alignment: CogId | null): Tile =>
  ({ hex: { q, r }, alignment, coherence: 0, mineral: "C", density: 1, density0: 1 });

// A owns (0,0); (1,0) is neutral but adjacent to A; (3,0) is far/neutral.
const stateWith = (tiles: Tile[]): GameState => {
  const map: Record<string, Tile> = {};
  for (const t of tiles) map[key(t.hex)] = t;
  return {
    turn: 1, phase: "commit", seed: 0, tiles: map,
    cogs: {
      A: { id: "A", index: 0, name: "A", treasury: emptyTreasury(), hearts: 0 },
      B: { id: "B", index: 1, name: "B", treasury: emptyTreasury(), hearts: 0 },
    },
    cogOrder: ["A", "B"], log: [],
  };
};

describe("OrderSchema", () => {
  it("parses a valid align order", () =>
    expect(OrderSchema.parse({ type: "align", tile: "0,0", force: 3 }).type).toBe("align"));
  it("rejects zero, negative, or above-cap align force", () => {
    expect(() => OrderSchema.parse({ type: "align", tile: "0,0", force: 0 })).toThrow();
    expect(() => OrderSchema.parse({ type: "align", tile: "0,0", force: -1 })).toThrow();
    expect(() => OrderSchema.parse({ type: "align", tile: "0,0", force: 11 })).toThrow();
  });
  it("parses exploit", () =>
    expect(OrderSchema.parse({ type: "exploit", tile: "0,0" }).type).toBe("exploit"));
  it("parses transfer and rejects a bad mineral", () => {
    expect(OrderSchema.parse({ type: "transfer", to: "B", mineral: "S", amount: 2 }).type).toBe("transfer");
    expect(() => OrderSchema.parse({ type: "transfer", to: "B", mineral: "X", amount: 2 })).toThrow();
  });
  it("rejects a non-integer transfer amount", () =>
    expect(() => OrderSchema.parse({ type: "transfer", to: "B", mineral: "S", amount: 2.5 })).toThrow());
  it("parses a bid and allows 0 (a non-bid) but rejects negative", () => {
    expect(OrderSchema.parse({ type: "bid", energy: 0 }).type).toBe("bid");
    expect(() => OrderSchema.parse({ type: "bid", energy: -1 })).toThrow();
  });
  it("rejects an unknown order type", () =>
    expect(() => OrderSchema.parse({ type: "nope" })).toThrow());
});

describe("legality", () => {
  const g = stateWith([tile(0, 0, "A"), tile(1, 0, null), tile(3, 0, null)]);

  it("isOwn is true only for the owner", () => {
    expect(isOwn(g, "A", "0,0")).toBe(true);
    expect(isOwn(g, "A", "1,0")).toBe(false);
    expect(isOwn(g, "A", "9,9")).toBe(false); // off-board
  });
  it("a cog's own tile is a legal align target (reinforce)", () =>
    expect(isLegalAlignTarget(g, "A", "0,0")).toBe(true));
  it("a neutral tile adjacent to owned territory is a legal align target", () =>
    expect(isLegalAlignTarget(g, "A", "1,0")).toBe(true));
  it("a far tile is legal too — force decays with distance instead (alignDistance)", () => {
    expect(isLegalAlignTarget(g, "A", "3,0")).toBe(true);
    expect(alignDistance(g, "A", "3,0")).toBe(3);
    expect(alignDistance(g, "A", "1,0")).toBe(1);
    expect(alignDistance(g, "A", "0,0")).toBe(0); // own tile
  });
  it("an off-board tile is illegal", () =>
    expect(isLegalAlignTarget(g, "A", "9,9")).toBe(false));
  it("a cog with no tiles has nothing to project from — every align is illegal", () => {
    const g2 = stateWith([tile(0, 0, null), tile(1, 0, "B")]);
    expect(isLegalAlignTarget(g2, "A", "0,0")).toBe(false);
    expect(alignDistance(g2, "A", "0,0")).toBe(Infinity);
  });
  it("an enemy-owned tile adjacent to own territory is a legal align target (siege)", () => {
    const g2 = stateWith([tile(0, 0, "A"), tile(1, 0, "B")]);
    expect(isLegalAlignTarget(g2, "A", "1,0")).toBe(true);
  });
});
