import { describe, it, expect } from "vitest";
import { newGame } from "./engine/game";
import { toSnapshot } from "./snapshot";
import { BOARD_RADIUS, COHERENCE_MAX } from "./engine/constants";

describe("toSnapshot", () => {
  it("captures all 127 tiles with axial coords + fields", () => {
    const s = toSnapshot(newGame(7, 4));
    expect(s.tiles).toHaveLength(127);
    const t = s.tiles[0]!;
    expect(t).toHaveProperty("q");
    expect(t).toHaveProperty("r");
    expect(t).toHaveProperty("coherence");
    expect(t).toHaveProperty("mineral");
  });
  it("captures one cog snapshot per cog, with energy derived from treasury", () => {
    const s = toSnapshot(newGame(7, 4));
    expect(s.cogs).toHaveLength(4);
    expect(s.cogs.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    for (const c of s.cogs) expect(c.energy).toBeGreaterThanOrEqual(0);
  });
  it("stamps meta (seed, radius, coherenceMax)", () => {
    const s = toSnapshot(newGame(7, 4));
    expect(s.seed).toBe(7);
    expect(s.radius).toBe(BOARD_RADIUS);
    expect(s.coherenceMax).toBe(COHERENCE_MAX);
  });
  it("is deterministic for a seed", () =>
    expect(toSnapshot(newGame(7, 4))).toEqual(toSnapshot(newGame(7, 4))));
});
