import { describe, it, expect } from "vitest";
import { upkeep } from "./upkeep";
import type { GameState, Tile, CogId, Mineral, Treasury, CogState } from "./types";
import { key } from "./hex";
import { COHERENCE_MAX, tileUpkeepCost } from "./constants";

const tile = (q: number, r: number, alignment: CogId | null, coherence: number, mineral: Mineral = "C", density = 1): Tile =>
  ({ hex: { q, r }, alignment, coherence, mineral, density, density0: density });
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

// Bills under the pay-or-rot model (see tileUpkeepCost):
//   lone tile (no in-board neighbors):       contested 3 + 0 aligned = 3e
//   friendly pair (each other's only nbr):   calm 1 + 1 aligned      = 2e
//   enemy pair:                              contested 3 + 1 aligned = 4e

describe("upkeep", () => {
  it("tileUpkeepCost: calm vs contested base + surcharge per non-neutral neighbor", () => {
    expect(tileUpkeepCost(0, 0, 0)).toBe(3); // lone tile in the wilderness
    expect(tileUpkeepCost(1, 1, 1)).toBe(2); // friendly pair — calm, one aligned neighbor
    expect(tileUpkeepCost(0, 1, 1)).toBe(4); // enemy pair — contested + surcharge
    expect(tileUpkeepCost(4, 6, 6)).toBe(7); // calm interior of a crowded blob: 1 + 6
    expect(tileUpkeepCost(3, 6, 6)).toBe(9); // even 3-of-6 split is NOT a majority: 3 + 6
  });

  it("a paid tile holds; paying double grows it +1", () => {
    // lone tile bills 3e. T(7): pay 3 (holds), then 3 more (grows) -> 1e left.
    const s = makeState({ tiles: [tile(0, 0, "A", 8, "Ge", 3)], cogOrder: ["A"], treasuries: { A: T(7, 0, 0, 0) } });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(9); // 8 -> double-paid -> 9
    expect(tre(state, "A")).toEqual(T(1, 0, 2, 0)); // 7-6=1 C; mint floor(3*9/10)=2 Ge
  });

  it("base upkeep paid but no double -> coherence simply holds", () => {
    const s = makeState({ tiles: [tile(0, 0, "A", 8, "C", 3)], cogOrder: ["A"], treasuries: { A: T(4, 0, 0, 0) } });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(8); // paid 3, 1 left < 3 -> no growth
    expect(tre(state, "A")).toEqual(T(3, 0, 0, 0)); // 4-3=1 C + mint floor(3*8/10)=2 C
  });

  it("mints density*coherence/10, stochastically rounded by its fractional part", () => {
    // lone tile bills 3e, paid exactly; coherence holds at 7 -> raw mint 3*7/10 = 2.1
    const s = makeState({ tiles: [tile(0, 0, "A", 7, "C", 3)], cogOrder: ["A"], treasuries: { A: T(3, 0, 0, 0) } });
    expect(tre(upkeep(s, FLOOR).state, "A")).toEqual(T(2, 0, 0, 0)); // 2.1 -> floor -> 2 C
    expect(tre(upkeep(s, CEIL).state, "A")).toEqual(T(3, 0, 0, 0)); // 2.1 -> +1 (prob 0.1) -> 3 C
  });

  it("unpaid tiles rot -1, heartland funded first (lowest coherence starves)", () => {
    // three lone A tiles bill 3e each; T(3) funds exactly the strongest.
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(10, 0, "A", 3), tile(20, 0, "A", 1)],
      cogOrder: ["A"], treasuries: { A: T(3, 0, 0, 0) },
    });
    const { state, events } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(5); // funded -> holds
    expect(at(state, 10, 0).coherence).toBe(2); // unpaid -> -1
    expect(at(state, 20, 0)).toMatchObject({ coherence: 0, alignment: null }); // 1 -> 0 -> neutral
    expect(events.some((e) => e.type === "starved" && e.tile === "10,0")).toBe(true);
    expect(events).toContainEqual({ type: "lost", cog: "A", tile: "20,0" });
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0)); // 3e spent; mints floor(.5)+floor(.2)=0
  });

  it("a calm pair is cheap to hold and to grow", () => {
    // friendly pair bills 2e each (calm + 1 neighbor). T(8): base 4, doubles 4 -> both grow.
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "A", 2)],
      cogOrder: ["A"], treasuries: { A: T(8, 0, 0, 0) },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(4);
    expect(at(state, 1, 0).coherence).toBe(3);
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0));
  });

  it("doubles go strongest-first when the wallet only stretches so far", () => {
    // friendly pair, 2e each: base 4 paid, 2 left -> only the stronger tile doubles.
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "A", 2)],
      cogOrder: ["A"], treasuries: { A: T(6, 0, 0, 0) },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(4); // doubled
    expect(at(state, 1, 0).coherence).toBe(2); // held only
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0));
  });

  it("tiles at COHERENCE_MAX never double-pay (nothing to buy)", () => {
    // friendly pair at max bills 2e each; the double pass skips them.
    const s = makeState({
      tiles: [tile(0, 0, "A", COHERENCE_MAX), tile(1, 0, "A", COHERENCE_MAX)],
      cogOrder: ["A"], treasuries: { A: T(8, 0, 0, 0) },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(COHERENCE_MAX);
    // 8 - 4 base = 4 C left, + each maxed d1 tile mints 1*10/10 = 1 C -> 6
    expect(tre(state, "A")).toEqual(T(6, 0, 0, 0));
  });

  it("contested ground is expensive: an enemy pair bills 4e each", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(1, 0, "B", 5)],
      cogOrder: ["A", "B"], treasuries: { A: T(4, 0, 0, 0), B: T(3, 0, 0, 0) },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(5); // A affords the 4e bill -> holds
    expect(at(state, 1, 0).coherence).toBe(4); // B cannot -> rots
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0));
    expect(tre(state, "B")).toEqual(T(3, 0, 0, 0)); // unpaid bills charge nothing
  });

  it("does not mutate the input state", () => {
    const s = makeState({ tiles: [tile(0, 0, "A", 4, "Ge", 3)], cogOrder: ["A"], treasuries: { A: T(1, 1, 1, 1) } });
    upkeep(s);
    expect(s.tiles[key({ q: 0, r: 0 })]!.coherence).toBe(4); // input tile unchanged
    expect(s.cogs.A!.treasury).toEqual(T(1, 1, 1, 1)); // input treasury unchanged
  });

  it("leaves neutral tiles untouched (no upkeep, no mint)", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(5, 0, null, 0, "C", 2)],
      cogOrder: ["A"], treasuries: { A: T(3, 0, 0, 0) },
    });
    const { state } = upkeep(s);
    expect(at(state, 5, 0)).toMatchObject({ alignment: null, coherence: 0, density: 2 });
  });

  it("a starved tile mints density x its REDUCED coherence (over /10)", () => {
    // lone tile, no funds: rot 4 -> 3; mint floor(5*3/10) = 1 O — post-upkeep coherence.
    const s = makeState({ tiles: [tile(0, 0, "A", 4, "O", 5)], cogOrder: ["A"], treasuries: { A: T() } });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(3);
    expect(tre(state, "A")).toEqual(T(0, 1, 0, 0));
  });

  it("a tile starved to Coherence 0 goes neutral and is reported lost", () => {
    const s = makeState({ tiles: [tile(0, 0, "A", 1)], cogOrder: ["A"], treasuries: { A: T() } });
    const { state, events } = upkeep(s, FLOOR);
    expect(at(state, 0, 0)).toMatchObject({ alignment: null, coherence: 0 });
    expect(events).toContainEqual({ type: "lost", cog: "A", tile: "0,0" });
  });
});
