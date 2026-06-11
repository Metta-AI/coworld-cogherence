import { describe, it, expect } from "vitest";
import { newGame } from "../shared/engine/game";
import { toSnapshot } from "../shared/snapshot";
import { buildCogSnapshot, redactEventFor } from "./redact";

describe("buildCogSnapshot", () => {
  it("keeps the viewer's own treasury but hides others'", () => {
    const snap = toSnapshot(newGame(7, 4));
    const view = buildCogSnapshot(snap, "cog0");
    const me = view.cogs.find((c) => c.id === "cog0")!;
    const other = view.cogs.find((c) => c.id === "cog1")!;
    expect(me.treasury).toEqual(snap.cogs.find((c) => c.id === "cog0")!.treasury);
    expect(other.treasury).toEqual({ C: 0, O: 0, Ge: 0, S: 0 });
    expect(other.hearts).toBe(snap.cogs.find((c) => c.id === "cog1")!.hearts); // hearts public
  });
  it("leaves tiles untouched (board is public)", () => {
    const snap = toSnapshot(newGame(7, 4));
    expect(buildCogSnapshot(snap, "cog0").tiles).toEqual(snap.tiles);
  });
});

describe("redactEventFor — bids are sealed per viewer", () => {
  it("drops a RIVAL's bid order, keeps the viewer's own", () => {
    const rival = { type: "order" as const, cog: "cog1", order: { type: "bid" as const, energy: 7 } };
    const mine = { type: "order" as const, cog: "cog0", order: { type: "bid" as const, energy: 3 } };
    expect(redactEventFor(rival, "cog0")).toBeNull();
    expect(redactEventFor(mine, "cog0")).toEqual(mine);
  });

  it("auction settle keeps winner + clearing price, strips rival bid amounts", () => {
    const settle = { type: "auction" as const, winner: "cog1", price: 3, bids: [["cog1", 7], ["cog0", 3]] as Array<[string, number]> };
    const seen = redactEventFor(settle, "cog0");
    expect(seen).toEqual({ type: "auction", winner: "cog1", price: 3, bids: [["cog0", 3]] });
  });

  it("board events pass through untouched", () => {
    const align = { type: "order" as const, cog: "cog1", order: { type: "align" as const, tile: "0,0", force: 2 } };
    expect(redactEventFor(align, "cog0")).toEqual(align);
  });
});
