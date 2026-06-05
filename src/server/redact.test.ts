import { describe, it, expect } from "vitest";
import { newGame } from "../shared/engine/game";
import { toSnapshot } from "../shared/snapshot";
import { buildCogSnapshot } from "./redact";

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
