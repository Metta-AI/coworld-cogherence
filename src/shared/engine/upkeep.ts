// The Upkeep phase: after Resolve, every Cog pays for its ground — and Coherence
// is purely economic. Each tile's bill: a base of floor(sqrt(tiles owned)) —
// empire scale taxes itself — plus RESISTANCE per enemy neighbor, each allied
// neighbor offsetting half an enemy, neutral counting for neither side
// (tileUpkeepCost). Heartland is funded first
// (descending coherence). An unpaid tile UNDER resistance loses 1 Coherence
// (and goes neutral at 0) — zero-resistance ground holds even when
// the wallet runs dry, so collapse stays localized to frontiers. Paying
// REGEN_COST on top of a tile's bill grows it +1 (max 1/turn, capped). Aligned
// tiles then mint their mineral at density×coherence. Pure: the input state is
// never mutated.

import type { GameState, CogId, HexKey, Tile, Treasury, CogState } from "./types";
import { neighbors, key } from "./hex";
import { chargeEnergy, maxEnergy } from "./energy";
import { makeRng } from "./rng";
import { MINT_DIVISOR, COHERENCE_MAX, REGEN_COST, upkeepBase, tileUpkeepCost } from "./constants";

/** Events emitted by an Upkeep phase (for the turn log / replay). */
export type UpkeepEvent =
  | { type: "starved"; cog: CogId; tile: HexKey; coherence: number }
  /** A tile went NEUTRAL — its upkeep went unpaid until the Coherence ran out.
   *  Flips to an enemy are capture events in Resolve. */
  | { type: "lost"; cog: CogId; tile: HexKey }
  | { type: "mint"; cog: CogId; gained: Treasury }
  /** Tempo bonus for the first Cog to lock its Commit this turn (granted in stepTurn).
   *  `reward` is denominated in ENERGY — the minerals granted are worth exactly that. */
  | { type: "firstCommit"; cog: CogId; reward: number };

const addT = (a: Treasury, b: Treasury): Treasury => ({ C: a.C + b.C, O: a.O + b.O, Ge: a.Ge + b.Ge, S: a.S + b.S });

/** Round x down to floor(x), plus 1 with probability equal to its fractional part
 *  (so 2.3 → 2 with p=0.7, 3 with p=0.3). Unbiased: E[result] = x. */
function stochasticRound(x: number, rng: () => number): number {
  const floor = Math.floor(x);
  return floor + (rng() < x - floor ? 1 : 0);
}

/**
 * The Upkeep phase: (1) bill every owned tile via tileUpkeepCost and pay base
 * upkeep heartland-first — unpaid tiles UNDER resistance lose 1 Coherence
 * (neutral at 0) while zero-resistance tiles hold;
 * (2) with what's left, pay REGEN_COST per tile (strongest first) to gain +1
 * Coherence, capped at COHERENCE_MAX; (3) mint density×coherence of each
 * aligned tile's mineral. Pure.
 */
export function upkeep(
  state: GameState,
  // Stochastic-mint RNG. Defaults to a per-turn stream seeded purely from
  // (seed, turn) so a game stays fully reproducible (replay == live); tests
  // inject a fixed rng for deterministic mint assertions.
  rng: () => number = makeRng((state.seed >>> 0) ^ Math.imul(state.turn, 0x9e3779b1)),
): { state: GameState; events: UpkeepEvent[] } {
  const events: UpkeepEvent[] = [];
  const tiles: Record<HexKey, Tile> = { ...state.tiles };
  const cogs: Record<CogId, CogState> = { ...state.cogs };

  // group aligned tiles by owner (pre-upkeep snapshot)
  const ownedBy = new Map<CogId, HexKey[]>();
  for (const cogId of state.cogOrder) ownedBy.set(cogId, []);
  for (const [k, t] of Object.entries(state.tiles)) {
    if (t.alignment !== null) ownedBy.get(t.alignment)?.push(k);
  }

  for (const cogId of state.cogOrder) {
    const cog = state.cogs[cogId];
    if (!cog) continue;
    let treasury = cog.treasury;
    const owned = ownedBy.get(cogId)!;

    // bill each tile from the pre-upkeep snapshot (simultaneous across cogs)
    const costs = new Map<HexKey, number>();
    const sheltered = new Set<HexKey>(); // zero resistance: allies cover the enemies (2 enemies per... see tileUpkeepCost)
    for (const k of owned) {
      const t = state.tiles[k]!;
      let friendly = 0;
      let enemies = 0;
      for (const n of neighbors(t.hex)) {
        const nt = state.tiles[key(n)];
        if (!nt || nt.alignment === null) continue;
        if (nt.alignment === t.alignment) friendly++;
        else enemies++;
      }
      costs.set(k, tileUpkeepCost(friendly, enemies, owned.length));
      if (tileUpkeepCost(friendly, enemies, owned.length) === upkeepBase(owned.length)) sheltered.add(k);
    }
    const desc = [...owned].sort((a, b) => state.tiles[b]!.coherence - state.tiles[a]!.coherence);

    // 1. base upkeep, heartland first — an unpaid tile rots −1 (neutral at 0)
    const paid = new Set<HexKey>();
    for (const k of desc) {
      const cost = costs.get(k)!;
      if (maxEnergy(treasury) >= cost) {
        treasury = chargeEnergy(treasury, cost)!;
        paid.add(k);
      } else if (!sheltered.has(k)) {
        // only ground under resistance rots when unpaid — sheltered tiles hold
        const t = tiles[k]!;
        const coherence = Math.max(0, t.coherence - 1);
        tiles[k] = coherence === 0 ? { ...t, coherence, alignment: null } : { ...t, coherence };
        events.push({ type: "starved", cog: cogId, tile: k, coherence });
        if (coherence === 0) events.push({ type: "lost", cog: cogId, tile: k });
      }
    }

    // 2. regen: REGEN_COST on top of a paid bill buys +1 Coherence (max 1/turn),
    //    strongest first — a flat price, so once it's unaffordable we're done.
    for (const k of desc) {
      if (!paid.has(k)) continue;
      const t = tiles[k]!;
      if (t.coherence >= COHERENCE_MAX) continue;
      if (maxEnergy(treasury) < REGEN_COST) break;
      treasury = chargeEnergy(treasury, REGEN_COST)!;
      tiles[k] = { ...t, coherence: t.coherence + 1 };
    }

    // 3. mint (post-upkeep coherence) — density×coherence/MINT_DIVISOR per tile
    //    still aligned, stochastically rounded. Tile-less cogs mint nothing.
    const stillMine = owned.filter((k) => tiles[k]!.alignment === cogId);
    if (stillMine.length > 0) {
      const gained: Treasury = { C: 0, O: 0, Ge: 0, S: 0 };
      for (const k of stillMine) {
        const t = tiles[k]!;
        gained[t.mineral] += stochasticRound((t.density * t.coherence) / MINT_DIVISOR, rng);
      }
      treasury = addT(treasury, gained);
      events.push({ type: "mint", cog: cogId, gained });
    }

    cogs[cogId] = { ...cog, treasury };
  }

  return { state: { ...state, tiles, cogs }, events };
}
