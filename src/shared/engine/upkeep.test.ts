import { describe, it, expect } from "vitest";
import { upkeep } from "./upkeep";
import type { GameState, Tile, CogId, Mineral, Treasury, CogState } from "./types";
import { key } from "./hex";
import { COHERENCE_MAX, upkeepPerTile } from "./constants";

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

describe("upkeep", () => {
  it("applies drift, charges upkeep at the empire rate, then mints floor(density*coherence/10)", () => {
    // single isolated tile: drift -1 (a free loss), funded at rate 2 (1 tile), then mints
    const s = makeState({ tiles: [tile(0, 0, "A", 8, "Ge", 3)], cogOrder: ["A"], treasuries: { A: T(5, 0, 0, 0) } });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(7);        // 8 -> drift -> 7 (funded, no extra loss)
    expect(tre(state, "A")).toEqual(T(3, 0, 2, 0));    // charge 2 -> T(3,0,0,0); mint floor(3*7/10)=2 Ge
  });

  it("mints density*coherence/10, stochastically rounded by its fractional part", () => {
    // funded isolated tile (rate 2 paid exactly), post-drift coherence 7, density 3 -> raw mint 3*7/10 = 2.1
    const s = makeState({ tiles: [tile(0, 0, "A", 8, "C", 3)], cogOrder: ["A"], treasuries: { A: T(2, 0, 0, 0) } });
    expect(tre(upkeep(s, FLOOR).state, "A")).toEqual(T(2, 0, 0, 0)); // charge 2 -> 0; 2.1 -> floor -> 2 C
    expect(tre(upkeep(s, CEIL).state, "A")).toEqual(T(3, 0, 0, 0));  // charge 2 -> 0; 2.1 -> +1 (prob 0.1) -> 3 C
  });

  it("starvation rots the frontier first (lowest coherence), floored at 0", () => {
    // three isolated A tiles; the wallet funds only the strongest at rate 2.
    // NOTE: drift (-1, isolated, free) runs BEFORE upkeep cost; the weakest tile
    // erodes to 0 at drift and goes neutral before upkeep is even owed on it.
    const s = makeState({
      tiles: [tile(0, 0, "A", 5), tile(3, 0, "A", 3), tile(6, 0, "A", 1)],
      cogOrder: ["A"], treasuries: { A: T(2, 0, 0, 0) }, // maxEnergy 2 -> funds exactly 1 tile at rate 2
    });
    const { state, events } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(4); // 5 -> drift 4 -> funded (highest) -> 4
    expect(at(state, 3, 0).coherence).toBe(1); // 3 -> drift 2 -> starved -> 1
    expect(at(state, 6, 0)).toMatchObject({ coherence: 0, alignment: null }); // 1 -> drift 0 -> neutral husk
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0)); // charge 2 C; mints floor(1*4/10)=floor(1*1/10)=0 C
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
      cogOrder: ["A", "B"], treasuries: { A: T(4, 0, 0, 0), B: T() },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(3);  // A: drift 4->3, funded
    expect(at(state, 10, 0).coherence).toBe(3); // A: drift 4->3, funded
    expect(at(state, 20, 0).coherence).toBe(1); // B: drift 3->2, starved -> 1
    expect(at(state, 30, 0).coherence).toBe(1); // B: drift 3->2, starved -> 1
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0)); // charge 2 tiles x rate 2 = 4; mint floor(1*3/10)=0 C
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

  it("a +1 drift gain drains 1e per tile; unaffordable gains are forfeited, strongest first", () => {
    // A friendly pair: each is the other's only in-board neighbor -> both point +1.
    // Wallet affords ONE gain: the stronger tile (0,0) gains, (1,0) forfeits.
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "A", 2)],
      cogOrder: ["A"], treasuries: { A: T(1, 0, 0, 0) },
    });
    const { state } = upkeep(s, FLOOR);
    // gains: (0,0) 3->4 (-1e), (1,0) forfeited at 2; upkeep rate(2)=2 with 0e -> both starve -1
    expect(at(state, 0, 0).coherence).toBe(3);
    expect(at(state, 1, 0).coherence).toBe(1);
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0));
  });

  it("a rich pair pays for both gains AND the upkeep rate", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", 3), tile(1, 0, "A", 2)],
      cogOrder: ["A"], treasuries: { A: T(6, 0, 0, 0) },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(4); // +1 gain, funded upkeep
    expect(at(state, 1, 0).coherence).toBe(3);
    expect(tre(state, "A")).toEqual(T(0, 0, 0, 0)); // 2 gains (2e) + 2 tiles x rate 2 (4e)
  });

  it("tiles already at COHERENCE_MAX pay nothing at drift (no gain to buy)", () => {
    const s = makeState({
      tiles: [tile(0, 0, "A", COHERENCE_MAX), tile(1, 0, "A", COHERENCE_MAX)],
      cogOrder: ["A"], treasuries: { A: T(4, 0, 0, 0) },
    });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(COHERENCE_MAX);
    // only the 2 x rate-2 upkeep, no gain charges; each maxed d1 tile mints 1*10/10 = 1 C
    expect(tre(state, "A")).toEqual(T(2, 0, 0, 0));
  });

  it("emits a lost event when a tile goes neutral — rot at drift, or starved out", () => {
    // (0,0): lone A tile at coherence 1 -> drift -1 -> 0 -> lost (rot).
    // B pair at coherence 1 with no energy: both gain forfeited? no — friendly pair
    // points +1 but B can pay 0 gains; upkeep unfunded -> starve -1 -> 0 -> lost (starved).
    const s = makeState({
      tiles: [tile(0, 0, "A", 1), tile(10, 0, "B", 1), tile(11, 0, "B", 1)],
      cogOrder: ["A", "B"], treasuries: { A: T(), B: T() },
    });
    const { state, events } = upkeep(s, FLOOR);
    expect(at(state, 0, 0)).toMatchObject({ alignment: null, coherence: 0 });
    expect(events).toContainEqual({ type: "lost", cog: "A", tile: "0,0", cause: "rot" });
    expect(at(state, 10, 0)).toMatchObject({ alignment: null, coherence: 0 });
    expect(events).toContainEqual({ type: "lost", cog: "B", tile: "10,0", cause: "starved" });
  });

  it("upkeepPerTile scales with empire size: 2e under 9 tiles, then +1 per sqrt step", () => {
    expect(upkeepPerTile(1)).toBe(2);
    expect(upkeepPerTile(8)).toBe(2);
    expect(upkeepPerTile(9)).toBe(3);
    expect(upkeepPerTile(35)).toBe(3);
    expect(upkeepPerTile(36)).toBe(4);
  });

  it("a tile starved to Coherence 0 goes neutral", () => {
    // lone A tile at coherence 2, no energy: drift -1 -> 1, then starved -1 -> 0 -> neutral husk
    const s = makeState({ tiles: [tile(0, 0, "A", 2)], cogOrder: ["A"], treasuries: { A: T() } });
    const { state } = upkeep(s, FLOOR);
    expect(at(state, 0, 0).coherence).toBe(0);
    expect(at(state, 0, 0).alignment).toBeNull();
  });
});
