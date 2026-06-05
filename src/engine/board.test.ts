import { describe, it, expect } from "vitest";
import { generateBoard } from "./board";

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
