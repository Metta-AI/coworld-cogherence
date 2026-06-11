import { describe, it, expect } from "vitest";
import { generateBoard, addCog } from "./board";
import { key } from "./hex";
import { maxEnergy } from "./energy";
import { DENSITY_MAX, BOARD_RADIUS } from "./constants";

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
  it("forces max density on the six corners and the center", () => {
    const g = generateBoard(7, 4);
    for (const hex of LANDMARKS) expect(g.tiles[key(hex)]!.density).toBe(DENSITY_MAX);
  });

  it("seeds half the board barren; the rest follows the 0..10 power law", () => {
    const landmarkKeys = new Set(LANDMARKS.map(key));
    let n = 0;
    let zeros = 0;
    let sum = 0;
    let over8 = 0;
    for (let seed = 0; seed < 60; seed++) {
      for (const [k, t] of Object.entries(generateBoard(seed, 4).tiles)) {
        if (landmarkKeys.has(k)) continue; // landmarks are forced to max
        expect(t.density).toBeGreaterThanOrEqual(0);
        expect(t.density).toBeLessThanOrEqual(DENSITY_MAX);
        if (t.density > 0) expect(Number.isInteger(t.density)).toBe(false); // non-barren is a float
        n++;
        if (t.density === 0) zeros++;
        sum += t.density;
        if (t.density > 8) over8++;
      }
    }
    // 50% exact zeros; the other half is 10·u² (mean 10/3, P(d>8)=1−√0.8≈0.106)
    expect(zeros / n).toBeCloseTo(0.5, 1);
    expect(sum / n).toBeCloseTo(0.5 * (10 / 3), 0);
    expect(over8 / n).toBeCloseTo(0.5 * 0.106, 1);
  });

  it("cogs wear names: roster defaults at generation, a custom name via addCog", () => {
    const g = generateBoard(7, 4);
    expect(g.cogOrder.map((id) => g.cogs[id]!.name)).toEqual(["Alice", "Bob", "Carol", "David"]);
    const g2 = addCog(g, "daveey");
    expect(g2.cogs.cog4!.name).toBe("daveey");
    expect(addCog(g).cogs.cog4!.name).toBe("Erin"); // no name -> next roster default
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
