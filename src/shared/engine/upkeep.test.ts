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

// Deterministic rounding controls for the stochastic mint (density*coherence/10):
const FLOOR = () => 0.999999; // rng never below any fractional part -> mint = floor(raw)
const CEIL = () => 0; // rng below every positive fractional part -> mint = ceil(raw)

describe("upkeep", () => {
  it("applies drift, charges upkeep, then mints floor(density*coherence/10)", () => {
    // single isolated tile: drift -1 (no friendly neighbors), funded, then mints
    const s = makeState({ tiles: [tile(0, 0, "A", 8, "Ge", 3)], cogOrder: ["A"], treasuries: { A: T(1, 1, 1, 1) } });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(7);        // 8 -> drift -> 7 (funded, no extra loss)
    expect(tre(state, "A")).toEqual(T(0, 1, 3, 1));    // charge 1 (one C) -> T(0,1,1,1); mint floor(3*7/10)=2 Ge -> Ge 1+2=3
  });

  it("mints density*coherence/10, stochastically rounded by its fractional part", () => {
    // funded isolated tile, post-drift coherence 7, density 3 -> raw mint 3*7/10 = 2.1
    const s = makeState({ tiles: [tile(0, 0, "A", 8, "C", 3)], cogOrder: ["A"], treasuries: { A: T(1, 0, 0, 0) } });
    expect(tre(upkeep(s, FLOOR).state, "A")).toEqual(T(2, 0, 0, 0)); // 2.1 -> floor -> 2 C
    expect(tre(upkeep(s, CEIL).state, "A")).toEqual(T(3, 0, 0, 0));  // 2.1 -> +1 (prob 0.1) -> 3 C
  });

  it("starvation rots the frontier first (lowest coherence), floored at 0", () => {
    // three isolated A tiles; treasury affords only 1 upkeep. NOTE: drift (-1, isolated) runs BEFORE upkeep cost.
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(3, 0, "A", 3), tile(6, 0, "A", 1)],
      cogOrder: ["A"], treasuries: { A: T(1, 0, 0, 0) }, // maxEnergy 1
    });
    const { state, events } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(4); // 5 -> drift 4 -> funded (highest) -> 4
    expect(at(state, 3, 0).coherence).toBe(1); // 3 -> drift 2 -> starved -> 1
    expect(at(state, 6, 0).coherence).toBe(0); // 1 -> drift 0 -> starved -> 0 (floored)
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0)); // charge 1 C -> T(0,0,0,0); mints floor(1*4/10)=floor(1*1/10)=0 C
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

  it("charges and starves each cog independently (rich cog funds all, broke cog starves all)", () => {
    // A is rich (funds both its tiles); B is broke (starves both). All tiles isolated -> drift -1 each.
    const s = makeState({
      tiles: [tile(0, 0, "A", 4), tile(10, 0, "A", 4), tile(20, 0, "B", 3), tile(30, 0, "B", 3)],
      cogOrder: ["A", "B"], treasuries: { A: T(2, 2, 2, 2), B: T() },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(3);  // A: drift 4->3, funded
    expect(at(state, 10, 0).coherence).toBe(3); // A: drift 4->3, funded
    expect(at(state, 20, 0).coherence).toBe(1); // B: drift 3->2, starved -> 1
    expect(at(state, 30, 0).coherence).toBe(1); // B: drift 3->2, starved -> 1
    expect(tre(state, "A")).toEqual(T(1, 1, 2, 2)); // charge 2 (two singles) -> T(1,1,2,2); mint floor(1*3/10)=0 C
    expect(tre(state, "B")).toEqual(T(0, 0, 0, 0)); // no charge; mint floor(1*1/10)=0 C
  });

  it("a starved tile mints density x its REDUCED coherence (over /10)", () => {
    // density 5 keeps the mint visible after /10: final coherence 2 -> 5*2/10 = 1 (a clean
    // integer), proving the mint uses the post-upkeep coherence (2), not pre-drift 4 (=2) or drift-only 3 (=1.5).
    const s = makeState({ tiles: [tile(0, 0, "A", 4, "O", 5)], cogOrder: ["A"], treasuries: { A: T() } });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(2);     // drift 4->3, starved -> 2
    expect(tre(state, "A")).toEqual(T(0, 1, 0, 0)); // mint floor(5 (density) * 2 (coherence) / 10) = 1 O, NOT floor(5*4/10)=2
  });

  it("a tile starved to Coherence 0 goes neutral", () => {
    // lone A tile at coherence 2, no energy: drift -1 -> 1, then starved -1 -> 0 -> neutral husk
    const s = makeState({ tiles: [tile(0, 0, "A", 2)], cogOrder: ["A"], treasuries: { A: T() } });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(0);
    expect(at(state, 0, 0).alignment).toBeNull();
  });
});
