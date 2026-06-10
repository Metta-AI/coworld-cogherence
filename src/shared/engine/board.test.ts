import { describe, it, expect } from "vitest";
import { generateBoard, addCog } from "./board";
import { key } from "./hex";
import { maxEnergy } from "./energy";
import { BOARD_RADIUS } from "./constants";

const R = BOARD_RADIUS;
// The corners + center are forced to density 3, so they're excluded from the
// random-distribution check below.
const LANDMARKS = [
  { q: R, r: 0 }, { q: R, r: -R }, { q: 0, r: -R },
  { q: -R, r: 0 }, { q: -R, r: R }, { q: 0, r: R }, { q: 0, r: 0 },
];

describe("generateBoard", () => {
  it("is deterministic for a seed", () =>
    expect(generateBoard(7, 4)).toEqual(generateBoard(7, 4)));
  it("creates 127 tiles for radius 6", () =>
    expect(Object.keys(generateBoard(7, 4).tiles)).toHaveLength(127));
  it("gives each of 4 cogs exactly one home tile", () => {
    const g = generateBoard(7, 4);
    const owned = Object.values(g.tiles).filter((t) => t.alignment !== null);
    expect(owned).toHaveLength(4);
    expect(new Set(owned.map((t) => t.alignment)).size).toBe(4);
  });
  it("forces density 3 on the six corners and the center", () => {
    const g = generateBoard(7, 4);
    for (const hex of LANDMARKS) expect(g.tiles[key(hex)]!.density).toBe(3);
  });

  it("weights density 20/48/24/8 across 0/1/2/3 (excluding the forced landmarks)", () => {
    const landmarkKeys = new Set(LANDMARKS.map(key));
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    let n = 0;
    for (let seed = 0; seed < 60; seed++) {
      for (const [k, t] of Object.entries(generateBoard(seed, 4).tiles)) {
        if (landmarkKeys.has(k)) continue; // these are always density 3 by design
        counts[t.density]!++;
        n++;
      }
    }
    expect(counts[0]! / n).toBeCloseTo(0.2, 1); // within ~0.05 over ~7100 random tiles
    expect(counts[1]! / n).toBeCloseTo(0.48, 1);
    expect(counts[2]! / n).toBeCloseTo(0.24, 1);
    expect(counts[3]! / n).toBeCloseTo(0.08, 1);
    expect(counts[1]!).toBeGreaterThan(counts[2]!);
    expect(counts[2]!).toBeGreaterThan(counts[3]!);
  });

  it("addCog seats the next cog at a free corner; throws when out of seats", () => {
    let g = generateBoard(7, 4);
    g = addCog(g);
    expect(g.cogOrder).toEqual(["cog0", "cog1", "cog2", "cog3", "cog4"]);
    const home = Object.values(g.tiles).find((t) => t.alignment === "cog4")!;
    expect(home.coherence).toBeGreaterThan(0);
    expect(maxEnergy(g.cogs.cog4!.treasury)).toBe(100);
    g = addCog(g); // the sixth and final seat
    expect(g.cogOrder).toHaveLength(6);
    expect(() => addCog(g)).toThrow(/at most 6/);
  });

  it("starts each cog with 100 energy (a balanced wallet)", () => {
    const g = generateBoard(7, 4);
    for (const id of g.cogOrder) expect(maxEnergy(g.cogs[id]!.treasury)).toBe(100);
  });

  it("home tiles start with positive coherence", () => {
    for (const t of Object.values(generateBoard(7, 4).tiles))
      if (t.alignment) expect(t.coherence).toBeGreaterThan(0);
  });
  it("starts at turn 1, negotiate phase, with the right cog roster", () => {
    const g = generateBoard(7, 4);
    expect(g.turn).toBe(1);
    expect(g.phase).toBe("negotiate");
    expect(g.cogOrder).toEqual(["cog0", "cog1", "cog2", "cog3"]);
  });
});
