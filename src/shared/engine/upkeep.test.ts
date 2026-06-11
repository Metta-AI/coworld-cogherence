import { describe, it, expect } from "vitest";
import { upkeep } from "./upkeep";
import type { GameState, Tile, CogId, Mineral, Treasury, CogState } from "./types";
import { key } from "./hex";
import { COHERENCE_MAX, maxRegen, tileUpkeepCost, upkeepBase } from "./constants";

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

// Bills under the base + resistance model (see tileUpkeepCost):
//   any tile:        floor(sqrt(tiles owned)) base
//   + 10e x enemies  allies do NOT cheapen defense; neutral counts for nothing
// Cogs holding 1-3 tiles pay base 1, so the small scenarios below stay simple.
// Allies buy HEALING SPEED instead: a paid tile regenerates up to
// maxRegen(allies) = 1 + allies/2 coherence per turn, each +1 costing 3e.

describe("upkeep", () => {
  it("tileUpkeepCost: empire-scaled base + 10e per enemy (allies never cheapen defense)", () => {
    expect(tileUpkeepCost(0, 1)).toBe(1); // quiet lone tile — just the base
    expect(tileUpkeepCost(0, 4)).toBe(2); // quiet tile in a 4-tile empire
    expect(tileUpkeepCost(1, 1)).toBe(11); // one enemy neighbor: base + 10e
    expect(tileUpkeepCost(3, 9)).toBe(33); // 3 enemies in a 9-tile empire: 3 + 30
  });

  it("maxRegen: allies buy healing speed — 1 + one per two allied neighbors", () => {
    expect(maxRegen(0)).toBe(1);
    expect(maxRegen(1)).toBe(1);
    expect(maxRegen(2)).toBe(2);
    expect(maxRegen(4)).toBe(3);
    expect(maxRegen(6)).toBe(4);
  });

  it("upkeepBase scales as floor(sqrt(tiles)): sprawl taxes itself", () => {
    expect(upkeepBase(1)).toBe(1);
    expect(upkeepBase(3)).toBe(1);
    expect(upkeepBase(4)).toBe(2);
    expect(upkeepBase(9)).toBe(3);
    expect(upkeepBase(48)).toBe(6);
    expect(upkeepBase(100)).toBe(10);
  });

  it("a 4-tile empire pays base 2 per tile", () => {
    // four isolated A tiles (no neighbors, no resistance) bill 2e each — T(8) pays exactly
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(10, 0, "A", 5), tile(20, 0, "A", 5), tile(30, 0, "A", 5)],
      cogOrder: ["A"], treasuries: { A: T(8, 0, 0, 0) },
    });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(5); // paid, no regen budget left
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0)); // 8 - 4x2 = 0; mint floor(1x5/10) = 0 each
  });

  it("a paid tile holds; paying the 3e regen grows it +1", () => {
    // lone tile bills 1e. T(4): pay 1 (holds), then 3 regen (grows) -> 0 left.
    const s = makeState({ tiles: [tile(0, 0, "A", 8, "Ge", 3)], cogOrder: ["A"], treasuries: { A: T(4, 0, 0, 0) } });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(9); // 8 -> regenerated -> 9
    expect(tre(state, "A")).toEqual(T(0, 0, 2, 0)); // 4-1-3=0 C; mint floor(3*9/10)=2 Ge
  });

  it("base upkeep paid but regen unaffordable -> coherence simply holds", () => {
    const s = makeState({ tiles: [tile(0, 0, "A", 8, "C", 3)], cogOrder: ["A"], treasuries: { A: T(3, 0, 0, 0) } });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(8); // paid 1, 2 left < 3 -> no regen
    expect(tre(state, "A")).toEqual(T(4, 0, 0, 0)); // 3-1=2 C + mint floor(3*8/10)=2 C
  });

  it("mints floor(density × coherence / 10), deterministically — floats floor away", () => {
    // lone tile bills 1e, paid exactly; coherence holds at 7 -> floor(3×7/10) = 2
    const s = makeState({ tiles: [tile(0, 0, "A", 7, "C", 3)], cogOrder: ["A"], treasuries: { A: T(1, 0, 0, 0) } });
    expect(tre(upkeep(s).state, "A")).toEqual(T(2, 0, 0, 0));
    // density is a FLOAT: 2.9 × 7 / 10 = 2.03 -> still mints 2
    const s2 = makeState({ tiles: [tile(0, 0, "A", 7, "C", 2.9)], cogOrder: ["A"], treasuries: { A: T(1, 0, 0, 0) } });
    expect(tre(upkeep(s2).state, "A")).toEqual(T(2, 0, 0, 0));
  });

  it("unpaid tiles under resistance rot -1, heartland funded first (lowest coherence starves)", () => {
    // three A tiles, each pressed by one B neighbor -> 11e bills; A's T(11)
    // funds exactly the strongest. B can pay all of its own 11e bills.
    const s = makeState({
      tiles: [
        tile(0, 0, "A", 5), tile(10, 0, "A", 3), tile(20, 0, "A", 1),
        tile(1, 0, "B", 5), tile(11, 0, "B", 5), tile(21, 0, "B", 5),
      ],
      cogOrder: ["A", "B"], treasuries: { A: T(11, 0, 0, 0), B: T(33, 0, 0, 0) },
    });
    const { state, events } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(5); // funded -> holds
    expect(at(state, 10, 0).coherence).toBe(2); // unpaid + pressed -> -1
    expect(at(state, 20, 0)).toMatchObject({ coherence: 0, alignment: null }); // 1 -> 0 -> neutral
    expect(events.some((e) => e.type === "starved" && e.tile === "10,0")).toBe(true);
    expect(events).toContainEqual({ type: "lost", cog: "A", tile: "20,0" });
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0)); // 11e spent; mints floor(5/10) + floor(2/10) = 0
  });

  it("a friendly pair is cheap to hold and to grow", () => {
    // friendly pair bills 1e each. T(8): base 2, regen 3+3 -> both grow, 0 left.
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "A", 2)],
      cogOrder: ["A"], treasuries: { A: T(8, 0, 0, 0) },
    });
    const { state } = upkeep(s);
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
    const { state } = upkeep(s);
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
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(COHERENCE_MAX);
    // 8 - 2 base = 6 C left, + each maxed d1 tile mints floor(10/10) = 1 C -> 8
    expect(tre(state, "A")).toEqual(T(8, 0, 0, 0));
  });

  it("unpaid zero-resistance tiles HOLD — collapse stays on the frontier", () => {
    // a broke cog's friendly pair (no enemies, 1e bills it can't pay) keeps its coherence
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "A", 2)],
      cogOrder: ["A"], treasuries: { A: T() },
    });
    const { state, events } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(3); // held, not rotted
    expect(at(state, 1, 0).coherence).toBe(2);
    expect(events.some((e) => e.type === "starved" || e.type === "lost")).toBe(false);
  });

  it("an enemy pair bills 11e each; the broke side rots", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(1, 0, "B", 5)],
      cogOrder: ["A", "B"], treasuries: { A: T(11, 0, 0, 0), B: T(10, 0, 0, 0) },
    });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(5); // A affords the 11e bill -> holds
    expect(at(state, 1, 0).coherence).toBe(4); // B cannot -> under resistance, rots
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0)); // charged 11; mint floor(5/10) = 0
    expect(tre(state, "B")).toEqual(T(10, 0, 0, 0)); // unpaid bills charge nothing; mint 0
  });

  it("allies speed healing: two allied neighbors let a paid tile regen +2 in one turn", () => {
    // a mutually-adjacent A triangle: (0,0)@5 flanked by two maxed allies.
    // owned=3 -> base 1, no enemies. T(9): bills 3, the maxed pair skip regen,
    // (0,0) buys maxRegen(2)=2 steps at 3e each -> coherence 7.
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(1, 0, "A", COHERENCE_MAX), tile(0, 1, "A", COHERENCE_MAX)],
      cogOrder: ["A"], treasuries: { A: T(9, 0, 0, 0) },
    });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(7); // +2 — allies sped the healing
    // 9 - 3 bills - 6 regen = 0; mint floor(10/10)x2 + floor(7/10) = 1+1+0 = 2 C
    expect(tre(state, "A")).toEqual(T(2, 0, 0, 0));
  });

  it("any enemy neighbor makes ground rot when unpaid — allies don't shelter it", () => {
    // A's (0,0) touches one ally and one enemy -> bill 1 + 10 = 11e, A is broke -> rots.
    const s = makeState({
      tiles: [tile(-1, 0, "A", 4), tile(0, 0, "A", 4), tile(1, 0, "B", 4)],
      cogOrder: ["A", "B"], treasuries: { A: T(), B: T(11, 0, 0, 0) },
    });
    const { state, events } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(3); // under resistance -> rots
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
    // A's tile pressed by an enemy, no funds: rot 4 -> 3; mint floor(5×3/10) = 1 O.
    const s = makeState({
      tiles: [tile(0, 0, "A", 4, "O", 5), tile(1, 0, "B", 9)],
      cogOrder: ["A", "B"], treasuries: { A: T(), B: T(2, 0, 0, 0) },
    });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(3);
    expect(tre(state, "A")).toEqual(T(0, 1, 0, 0));
  });

  it("a tile starved to Coherence 0 goes neutral and is reported lost", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 1), tile(1, 0, "B", 5)],
      cogOrder: ["A", "B"], treasuries: { A: T(), B: T(2, 0, 0, 0) },
    });
    const { state, events } = upkeep(s);
    expect(at(state, 0, 0)).toMatchObject({ alignment: null, coherence: 0 });
    expect(events).toContainEqual({ type: "lost", cog: "A", tile: "0,0" });
  });
});
