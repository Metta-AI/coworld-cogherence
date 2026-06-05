import { describe, it, expect } from "vitest";
import { upkeep } from "./upkeep";
import type { GameState, Tile, CogId, Mineral, Treasury, CogState } from "./types";
import { key } from "./hex";

const tile = (q: number, r: number, alignment: CogId | null, coherence: number, mineral: Mineral = "C", density = 1): Tile =>
  ({ hex: { q, r }, alignment, coherence, mineral, density });
const T = (C = 0, O = 0, Ge = 0, S = 0): Treasury => ({ C, O, Ge, S });

const makeState = (opts: { tiles: Tile[]; cogOrder: CogId[]; treasuries?: Record<CogId, Treasury> }): GameState => {
  const map: Record<string, Tile> = {};
  for (const t of opts.tiles) map[key(t.hex)] = t;
  const cogs: Record<CogId, CogState> = {};
  opts.cogOrder.forEach((id, i) => {
    cogs[id] = { id, index: i, treasury: opts.treasuries?.[id] ?? T(), hearts: 0 };
  });
  return { turn: 1, phase: "upkeep", seed: 0, tiles: map, cogs, cogOrder: opts.cogOrder, log: [] };
};
const tre = (g: GameState, id: CogId) => g.cogs[id]!.treasury;
const at = (g: GameState, q: number, r: number) => g.tiles[key({ q, r })]!;

describe("upkeep", () => {
  it("applies drift, charges upkeep, then mints density*coherence", () => {
    // single isolated tile: drift -1 (no friendly neighbors), funded, then mints
    const s = makeState({ tiles: [tile(0, 0, "A", 4, "Ge", 3)], cogOrder: ["A"], treasuries: { A: T(1, 1, 1, 1) } });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(3);        // 4 -> drift -> 3 (funded, no extra loss)
    expect(tre(state, "A")).toEqual(T(0, 1, 10, 1));   // charge 1 (one C) -> T(0,1,1,1); mint 3*3=9 Ge -> Ge 1+9=10
  });

  it("starvation rots the frontier first (lowest coherence), floored at 0", () => {
    // three isolated A tiles; treasury affords only 1 upkeep. NOTE: drift (-1, isolated) runs BEFORE upkeep cost.
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(3, 0, "A", 3), tile(6, 0, "A", 1)],
      cogOrder: ["A"], treasuries: { A: T(1, 0, 0, 0) }, // maxEnergy 1
    });
    const { state, events } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(4); // 5 -> drift 4 -> funded (highest) -> 4
    expect(at(state, 3, 0).coherence).toBe(1); // 3 -> drift 2 -> starved -> 1
    expect(at(state, 6, 0).coherence).toBe(0); // 1 -> drift 0 -> starved -> 0 (floored)
    expect(tre(state, "A")).toEqual(T(5, 0, 0, 0)); // charge 1 C -> T(0,0,0,0); mint 4+1+0 = 5 C
    expect(events.some((e) => e.type === "starved" && e.tile === "3,0")).toBe(true);
  });

  it("does not mutate the input state", () => {
    const s = makeState({ tiles: [tile(0, 0, "A", 4, "Ge", 3)], cogOrder: ["A"], treasuries: { A: T(1, 1, 1, 1) } });
    upkeep(s);
    expect(s.tiles[key({ q: 0, r: 0 })]!.coherence).toBe(4); // input tile unchanged
    expect(s.cogs.A!.treasury).toEqual(T(1, 1, 1, 1));       // input treasury unchanged
  });

  it("leaves neutral tiles untouched (no drift, no upkeep, no mint)", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(5, 0, null, 0, "C", 2)],
      cogOrder: ["A"], treasuries: { A: T(1, 1, 1, 1) },
    });
    const { state } = upkeep(s);
    expect(at(state, 5, 0)).toMatchObject({ alignment: null, coherence: 0, density: 2 });
  });
});
