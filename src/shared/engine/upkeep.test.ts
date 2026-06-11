import { describe, it, expect } from "vitest";
import { upkeep } from "./upkeep";
import type { GameState, Tile, CogId, Mineral, Treasury, CogState } from "./types";
import { key } from "./hex";
import { COHERENCE_MAX, upkeepBase } from "./constants";

const tile = (q: number, r: number, alignment: CogId | null, coherence: number, mineral: Mineral = "C", density = 1): Tile =>
  ({ hex: { q, r }, alignment, coherence, mineral, density, density0: density });
const T = (C = 0, O = 0, Ge = 0, S = 0): Treasury => ({ C, O, Ge, S });

const makeState = (opts: { tiles: Tile[]; cogOrder: CogId[]; treasuries?: Record<CogId, Treasury>; energies?: Record<CogId, number> }): GameState => {
  const map: Record<string, Tile> = {};
  for (const t of opts.tiles) map[key(t.hex)] = t;
  const cogs: Record<CogId, CogState> = {};
  opts.cogOrder.forEach((id, i) => {
    cogs[id] = { id, index: i, name: id, treasury: opts.treasuries?.[id] ?? T(), energy: opts.energies?.[id] ?? 0, hearts: 0 };
  });
  return { turn: 1, phase: "upkeep", seed: 0, tiles: map, cogs, cogOrder: opts.cogOrder, log: [] };
};
const tre = (g: GameState, id: CogId) => g.cogs[id]!.treasury;
const nrg = (g: GameState, id: CogId) => g.cogs[id]!.energy;
const at = (g: GameState, q: number, r: number) => g.tiles[key({ q, r })]!;

// Bills are just the empire-scaled base — floor(sqrt(tiles owned)) per tile;
// cogs holding 1-3 tiles pay base 1, so the small scenarios below stay simple.
// Resistance costs NO energy: every upkeep a tile's coherence shifts by
// (+1 per allied neighbor, paid bills only) − (1 per enemy neighbor), net,
// clamped 0..COHERENCE_MAX — at 0 the tile goes neutral.

describe("upkeep", () => {
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
      cogOrder: ["A"], energies: { A: 8 },
    });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(5); // paid; isolated tiles have no allies to heal them
    expect(nrg(state, "A")).toBe(0); // 8 - 4×2 = 0; mint floor(1×5/10) = 0 each
  });

  it("a lone paid tile holds — healing comes only from allied neighbors", () => {
    // lone tile bills 1e; no allies -> no regen, money can't buy it.
    const s = makeState({ tiles: [tile(0, 0, "A", 8, "Ge", 3)], cogOrder: ["A"], energies: { A: 4 } });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(8); // held — no allies, no healing
    expect(nrg(state, "A")).toBe(3); // 4 - 1e bill
    expect(tre(state, "A")).toEqual(T(0, 0, 2, 0)); // mint floor(3×8/10) = 2 Ge
  });

  it("mints floor(density × coherence / 10), deterministically — floats floor away", () => {
    // lone tile bills 1e, paid exactly; coherence holds at 7 -> floor(3×7/10) = 2
    const s = makeState({ tiles: [tile(0, 0, "A", 7, "C", 3)], cogOrder: ["A"], energies: { A: 1 } });
    expect(tre(upkeep(s).state, "A")).toEqual(T(2, 0, 0, 0));
    // density is a FLOAT: 2.9 × 7 / 10 = 2.03 -> still mints 2
    const s2 = makeState({ tiles: [tile(0, 0, "A", 7, "C", 2.9)], cogOrder: ["A"], energies: { A: 1 } });
    expect(tre(upkeep(s2).state, "A")).toEqual(T(2, 0, 0, 0));
  });

  it("enemy pressure drains −1 per foe — money can't stop it; at 0 the tile goes neutral", () => {
    // three A tiles, each pressed by one B neighbor and backed by no allies.
    // A pays every 1e bill — the drain lands anyway: resistance isn't money.
    const s = makeState({
      tiles: [
        tile(0, 0, "A", 5), tile(10, 0, "A", 3), tile(20, 0, "A", 1),
        tile(1, 0, "B", 5), tile(11, 0, "B", 5), tile(21, 0, "B", 5),
      ],
      cogOrder: ["A", "B"], energies: { A: 11, B: 33 },
    });
    const { state, events } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(4); // paid, 1 foe, 0 allies -> −1
    expect(at(state, 10, 0).coherence).toBe(2);
    expect(at(state, 20, 0)).toMatchObject({ coherence: 0, alignment: null }); // 1 -> 0 -> neutral
    expect(events.some((e) => e.type === "starved" && e.tile === "10,0")).toBe(true);
    expect(events).toContainEqual({ type: "lost", cog: "A", tile: "20,0" });
    expect(nrg(state, "A")).toBe(8); // 3 × 1e bills; mints floor(4/10)+floor(2/10) = 0 minerals
  });

  it("a paid friendly pair heals +1 each, free — allies are the regen", () => {
    // friendly pair bills 1e each. T(8): base 2 paid; each tile has 1 ally -> +1 free.
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "A", 2)],
      cogOrder: ["A"], energies: { A: 8 },
    });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(4);
    expect(at(state, 1, 0).coherence).toBe(3);
    expect(nrg(state, "A")).toBe(6); // healing cost nothing: 8 - 2 bills
  });

  it("tiles at COHERENCE_MAX stay capped — allies can't overheal", () => {
    // friendly pair at max bills 1e each; the regen pass caps at max.
    const s = makeState({
      tiles: [tile(0, 0, "A", COHERENCE_MAX), tile(1, 0, "A", COHERENCE_MAX)],
      cogOrder: ["A"], energies: { A: 8 },
    });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(COHERENCE_MAX);
    expect(nrg(state, "A")).toBe(6); // 8 - 2 base bills
    expect(tre(state, "A")).toEqual(T(2, 0, 0, 0)); // each maxed d1 tile mints floor(10/10) = 1 C
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

  it("an unbacked enemy pair grinds each other down −1/turn — both paid, both pressed", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(1, 0, "B", 5)],
      cogOrder: ["A", "B"], energies: { A: 1, B: 1 },
    });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(4); // 0 allies − 1 foe
    expect(at(state, 1, 0).coherence).toBe(4);
    expect(nrg(state, "A")).toBe(0); // just the 1e base bill
  });

  it("allies offset enemy pressure: net = allies − foes on a paid tile", () => {
    // A(0,0) touches two A allies and one B foe -> paid net +1; the B tile
    // (1 ally of its own, 1 foe) nets 0 and holds.
    const s = makeState({
      tiles: [tile(-1, 0, "A", 9), tile(-1, 1, "A", 9), tile(0, 0, "A", 5), tile(1, 0, "B", 5), tile(2, 0, "B", 5)],
      cogOrder: ["A", "B"], energies: { A: 3, B: 2 },
    });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(6); // 2 allies − 1 foe = +1
    expect(at(state, 1, 0).coherence).toBe(5); // 1 ally − 1 foe = 0 -> holds
  });

  it("two allied neighbors heal a paid tile +2 in one turn, free", () => {
    // a mutually-adjacent A triangle: (0,0)@5 flanked by two maxed allies.
    // owned=3 -> base 1, no enemies. T(9): bills 3; (0,0) heals +1 per ally -> 7.
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(1, 0, "A", COHERENCE_MAX), tile(0, 1, "A", COHERENCE_MAX)],
      cogOrder: ["A"], energies: { A: 9 },
    });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(7); // +2 — one per allied neighbor, free
    expect(nrg(state, "A")).toBe(6); // 9 - 3 bills
    expect(tre(state, "A")).toEqual(T(2, 0, 0, 0)); // mint floor(10/10)×2 + floor(7/10) = 2 C
  });

  it("unpaid tiles do not heal — regen rides on a paid bill", () => {
    // broke A: the sheltered pair holds (zero resistance) but gets NO free healing.
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "A", 2)],
      cogOrder: ["A"], treasuries: { A: T() },
    });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(3); // held, not healed
    expect(at(state, 1, 0).coherence).toBe(2);
  });

  it("an UNPAID tile gets no ally healing — the enemy drain lands in full", () => {
    // A's (0,0) touches one ally and one enemy; A is broke, so the ally bonus
    // is off: delta = 0 − 1 = −1 (paid, it would have netted 0 and held).
    const s = makeState({
      tiles: [tile(-1, 0, "A", 4), tile(0, 0, "A", 4), tile(1, 0, "B", 4)],
      cogOrder: ["A", "B"], energies: { B: 11 },
    });
    const { state, events } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(3); // pressed, unhealed
    expect(events.some((e) => e.type === "starved" && e.tile === "0,0")).toBe(true);
  });

  it("does not mutate the input state", () => {
    const s = makeState({ tiles: [tile(0, 0, "A", 4, "Ge", 3)], cogOrder: ["A"], treasuries: { A: T(1, 1, 1, 1) }, energies: { A: 5 } });
    upkeep(s);
    expect(s.tiles[key({ q: 0, r: 0 })]!.coherence).toBe(4); // input tile unchanged
    expect(s.cogs.A!.treasury).toEqual(T(1, 1, 1, 1)); // input treasury unchanged
    expect(s.cogs.A!.energy).toBe(5); // input energy unchanged
  });

  it("leaves neutral tiles untouched (no upkeep, no mint)", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(5, 0, null, 0, "C", 2)],
      cogOrder: ["A"], energies: { A: 3 },
    });
    const { state } = upkeep(s);
    expect(at(state, 5, 0)).toMatchObject({ alignment: null, coherence: 0, density: 2 });
  });

  it("a starved tile mints density x its REDUCED coherence", () => {
    // A's tile pressed by an enemy, no funds: rot 4 -> 3; mint floor(5×3/10) = 1 O.
    const s = makeState({
      tiles: [tile(0, 0, "A", 4, "O", 5), tile(1, 0, "B", 9)],
      cogOrder: ["A", "B"], energies: { B: 2 },
    });
    const { state } = upkeep(s);
    expect(at(state, 0, 0).coherence).toBe(3);
    expect(tre(state, "A")).toEqual(T(0, 1, 0, 0));
  });

  it("a tile starved to Coherence 0 goes neutral and is reported lost", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 1), tile(1, 0, "B", 5)],
      cogOrder: ["A", "B"], energies: { B: 2 },
    });
    const { state, events } = upkeep(s);
    expect(at(state, 0, 0)).toMatchObject({ alignment: null, coherence: 0 });
    expect(events).toContainEqual({ type: "lost", cog: "A", tile: "0,0" });
  });
});
