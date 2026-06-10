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

// Deterministic rounding controls for the stochastic mint:
const FLOOR = () => 0.999999; // rng never below any fractional part -> mint = floor(raw)
const CEIL = () => 0; // rng below every positive fractional part -> mint = ceil(raw)

// Bills under the base + resistance model (see tileUpkeepCost):
//   any tile:                              1e base
//   + max(0, ceil(enemies - allies/2))     each ally offsets HALF an enemy
//   (neutral neighbors count for neither side; rounding goes against the defender)
// Regen is a flat 3e on top of a paid bill (+1 coherence, max 1/turn).

describe("upkeep", () => {
  it("tileUpkeepCost: flat base + enemies, each ally offsetting half an enemy", () => {
    expect(tileUpkeepCost(0, 0)).toBe(1); // lone tile in the wilderness — just the base
    expect(tileUpkeepCost(1, 0)).toBe(1); // friendly pair
    expect(tileUpkeepCost(0, 1)).toBe(2); // enemy pair: base + 1 enemy
    expect(tileUpkeepCost(6, 0)).toBe(1); // blob interior stays cheap
    expect(tileUpkeepCost(1, 1)).toBe(2); // 1v1 front: the ally only half-covers -> ceil(0.5) = 1
    expect(tileUpkeepCost(2, 1)).toBe(1); // two allies fully cover one enemy
    expect(tileUpkeepCost(3, 3)).toBe(3); // even front line: 3 - 1.5 -> +2
    expect(tileUpkeepCost(2, 4)).toBe(4); // outnumbered 4v2: 4 - 1 -> +3
    expect(tileUpkeepCost(0, 3)).toBe(4); // salient ringed by 3 enemies
  });

  it("a paid tile holds; paying the 3e regen grows it +1", () => {
    // lone tile bills 1e. T(4): pay 1 (holds), then 3 regen (grows) -> 0 left.
    const s = makeState({ tiles: [tile(0, 0, "A", 8, "Ge", 3)], cogOrder: ["A"], treasuries: { A: T(4, 0, 0, 0) } });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(9); // 8 -> regenerated -> 9
    expect(tre(state, "A")).toEqual(T(0, 0, 5, 0)); // 4-1-3=0 C; mint floor(3*9/5)=5 Ge
  });

  it("base upkeep paid but regen unaffordable -> coherence simply holds", () => {
    const s = makeState({ tiles: [tile(0, 0, "A", 8, "C", 3)], cogOrder: ["A"], treasuries: { A: T(3, 0, 0, 0) } });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(8); // paid 1, 2 left < 3 -> no regen
    expect(tre(state, "A")).toEqual(T(6, 0, 0, 0)); // 3-1=2 C + mint floor(3*8/5)=4 C
  });

  it("mints density*coherence/MINT_DIVISOR, stochastically rounded by its fractional part", () => {
    // lone tile bills 1e, paid exactly; coherence holds at 7 -> raw mint 3*7/5 = 4.2
    const s = makeState({ tiles: [tile(0, 0, "A", 7, "C", 3)], cogOrder: ["A"], treasuries: { A: T(1, 0, 0, 0) } });
    expect(tre(upkeep(s, FLOOR).state, "A")).toEqual(T(4, 0, 0, 0)); // 4.2 -> floor -> 4 C
    expect(tre(upkeep(s, CEIL).state, "A")).toEqual(T(5, 0, 0, 0)); // 4.2 -> +1 (prob 0.2) -> 5 C
  });

  it("unpaid tiles under resistance rot -1, heartland funded first (lowest coherence starves)", () => {
    // three A tiles, each pressed by one B neighbor -> 2e bills; A's T(2) funds
    // exactly the strongest. B can pay all of its own 2e bills.
    const s = makeState({
      tiles: [
        tile(0, 0, "A", 5), tile(10, 0, "A", 3), tile(20, 0, "A", 1),
        tile(1, 0, "B", 5), tile(11, 0, "B", 5), tile(21, 0, "B", 5),
      ],
      cogOrder: ["A", "B"], treasuries: { A: T(2, 0, 0, 0), B: T(6, 0, 0, 0) },
    });
    const { state, events } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(5); // funded -> holds
    expect(at(state, 10, 0).coherence).toBe(2); // unpaid + pressed -> -1
    expect(at(state, 20, 0)).toMatchObject({ coherence: 0, alignment: null }); // 1 -> 0 -> neutral
    expect(events.some((e) => e.type === "starved" && e.tile === "10,0")).toBe(true);
    expect(events).toContainEqual({ type: "lost", cog: "A", tile: "20,0" });
    expect(tre(state, "A")).toEqual(T(1, 0, 0, 0)); // 2e spent; mints 5/5=1 + floor(2/5)=0
  });

  it("a friendly pair is cheap to hold and to grow", () => {
    // friendly pair bills 1e each. T(8): base 2, regen 3+3 -> both grow, 0 left.
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "A", 2)],
      cogOrder: ["A"], treasuries: { A: T(8, 0, 0, 0) },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(4);
    expect(at(state, 1, 0).coherence).toBe(3);
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0));
  });

  it("regen goes strongest-first when the wallet only stretches so far", () => {
    // friendly pair, 1e each: base 2 paid, 3 left -> only the stronger tile regenerates.
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "A", 2)],
      cogOrder: ["A"], treasuries: { A: T(5, 0, 0, 0) },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(4); // regenerated
    expect(at(state, 1, 0).coherence).toBe(2); // held only
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0));
  });

  it("tiles at COHERENCE_MAX never pay regen (nothing to buy)", () => {
    // friendly pair at max bills 1e each; the regen pass skips them.
    const s = makeState({
      tiles: [tile(0, 0, "A", COHERENCE_MAX), tile(1, 0, "A", COHERENCE_MAX)],
      cogOrder: ["A"], treasuries: { A: T(8, 0, 0, 0) },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(COHERENCE_MAX);
    // 8 - 2 base = 6 C left, + each maxed d1 tile mints 10/5 = 2 C -> 10
    expect(tre(state, "A")).toEqual(T(10, 0, 0, 0));
  });

  it("unpaid zero-resistance tiles HOLD — collapse stays on the frontier", () => {
    // a broke cog's friendly pair (no enemies, 1e bills it can't pay) keeps its coherence
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "A", 2)],
      cogOrder: ["A"], treasuries: { A: T() },
    });
    const { state, events } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(3); // held, not rotted
    expect(at(state, 1, 0).coherence).toBe(2);
    expect(events.some((e) => e.type === "starved" || e.type === "lost")).toBe(false);
  });

  it("an enemy pair bills 2e each; the broke side rots", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(1, 0, "B", 5)],
      cogOrder: ["A", "B"], treasuries: { A: T(2, 0, 0, 0), B: T(1, 0, 0, 0) },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(5); // A affords the 2e bill -> holds
    expect(at(state, 1, 0).coherence).toBe(4); // B cannot -> under resistance, rots
    expect(tre(state, "A")).toEqual(T(1, 0, 0, 0)); // charged 2; mint 5/5 = 1 C
    expect(tre(state, "B")).toEqual(T(1, 0, 0, 0)); // unpaid bills charge nothing; mint floor(4/5)=0
  });

  it("two allies fully cover an enemy; one only half-covers (rounded against you)", () => {
    // A's (1,0) touches TWO A tiles and one B tile -> resistance ceil(1-1)=0 ->
    // 1e bill, held even unpaid. A's (0,0) touches one ally + one enemy... no:
    // (0,0) touches (1,0)=ally and (-1,0)? not on board -> just allies. The
    // half-cover case is asserted directly in the tileUpkeepCost unit test.
    const s = makeState({
      tiles: [tile(0, 0, "A", 4), tile(1, -1, "A", 4), tile(1, 0, "A", 4), tile(2, 0, "B", 4)],
      cogOrder: ["A", "B"], treasuries: { A: T(), B: T(4, 0, 0, 0) },
    });
    const { state, events } = upkeep(s, FLOOR);
    expect(at(state, 1, 0).coherence).toBe(4); // 2 allies v 1 enemy -> sheltered, held even unpaid
    expect(events.some((e) => e.type === "starved" && e.tile === "1,0")).toBe(false);
  });

  it("a 1v1 front line is under resistance: unpaid, it rots", () => {
    // A's (0,0) touches one ally and one enemy -> resistance ceil(0.5)=1 -> 2e
    // bill A cannot pay -> rots.
    const s = makeState({
      tiles: [tile(-1, 0, "A", 4), tile(0, 0, "A", 4), tile(1, 0, "B", 4)],
      cogOrder: ["A", "B"], treasuries: { A: T(), B: T(4, 0, 0, 0) },
    });
    const { state, events } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(3); // half-covered -> still rots when unpaid
    expect(events.some((e) => e.type === "starved" && e.tile === "0,0")).toBe(true);
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

  it("a starved tile mints density x its REDUCED coherence", () => {
    // A's tile pressed by an enemy, no funds: rot 4 -> 3; mint floor(5*3/5) = 3 O.
    const s = makeState({
      tiles: [tile(0, 0, "A", 4, "O", 5), tile(1, 0, "B", 9)],
      cogOrder: ["A", "B"], treasuries: { A: T(), B: T(2, 0, 0, 0) },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(3);
    expect(tre(state, "A")).toEqual(T(0, 3, 0, 0));
  });

  it("a tile starved to Coherence 0 goes neutral and is reported lost", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 1), tile(1, 0, "B", 5)],
      cogOrder: ["A", "B"], treasuries: { A: T(), B: T(2, 0, 0, 0) },
    });
    const { state, events } = upkeep(s, FLOOR);
    expect(at(state, 0, 0)).toMatchObject({ alignment: null, coherence: 0 });
    expect(events).toContainEqual({ type: "lost", cog: "A", tile: "0,0" });
  });
});
