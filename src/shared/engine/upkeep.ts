// The Upkeep phase: after Resolve, the world "breathes". Coherence drifts by the
// neighbor rule, each Cog pays to hold its tiles (heartland funded first, the
// frontier rotting when energy runs short), and aligned tiles mint their mineral
// at density×coherence. The LOCKED order — drift, then cost, then mint — makes
// minting use post-drift, post-upkeep coherence. Pure: the input state is never
// mutated.

import type { GameState, CogId, HexKey, Tile, Treasury, CogState, Mineral } from "./types";
import { applyDrift } from "./coherence";
import { chargeEnergy, maxEnergy } from "./energy";
import { makeRng } from "./rng";
import { MINT_DIVISOR, UPKEEP_PER_TILE } from "./constants";

/** Events emitted by an Upkeep phase (for the turn log / replay). */
export type UpkeepEvent =
  | { type: "starved"; cog: CogId; tile: HexKey; coherence: number }
  | { type: "mint"; cog: CogId; gained: Treasury }
  /** Tempo bonus for the first Cog to lock its Commit this turn (granted in stepTurn). */
  | { type: "firstCommit"; cog: CogId; mineral: Mineral; reward: number };

const addT = (a: Treasury, b: Treasury): Treasury => ({ C: a.C + b.C, O: a.O + b.O, Ge: a.Ge + b.Ge, S: a.S + b.S });

/** Round x down to floor(x), plus 1 with probability equal to its fractional part
 *  (so 2.3 → 2 with p=0.7, 3 with p=0.3). Unbiased: E[result] = x. */
function stochasticRound(x: number, rng: () => number): number {
  const floor = Math.floor(x);
  return floor + (rng() < x - floor ? 1 : 0);
}

/**
 * The Upkeep phase: (1) coherence drift, (2) per-Cog upkeep cost — fund tiles in
 * descending coherence, starve the rest (lowest first, −1 coherence floored at 0),
 * (3) mint density×coherence of each aligned tile's mineral. Pure.
 */
export function upkeep(
  state: GameState,
  // Stochastic-mint RNG. Defaults to a per-turn stream seeded purely from
  // (seed, turn) so a game stays fully reproducible (replay == live); tests
  // inject a fixed rng for deterministic mint assertions.
  rng: () => number = makeRng((state.seed >>> 0) ^ Math.imul(state.turn, 0x9e3779b1)),
): { state: GameState; events: UpkeepEvent[] } {
  const events: UpkeepEvent[] = [];

  // 1. coherence drift (returns a fresh state; input untouched)
  const drifted = applyDrift(state);
  const tiles: Record<HexKey, Tile> = { ...drifted.tiles };

  // group aligned tiles by owner (post-drift)
  const ownedBy = new Map<CogId, HexKey[]>();
  for (const cogId of drifted.cogOrder) ownedBy.set(cogId, []);
  for (const [k, t] of Object.entries(tiles)) {
    if (t.alignment !== null) ownedBy.get(t.alignment)?.push(k);
  }

  const cogs: Record<CogId, CogState> = { ...drifted.cogs };
  for (const cogId of drifted.cogOrder) {
    const cog = drifted.cogs[cogId];
    if (!cog) continue;
    const owned = ownedBy.get(cogId)!;
    let treasury = cog.treasury;

    // 2. upkeep cost
    if (owned.length > 0) {
      const funded = Math.min(owned.length, Math.floor(maxEnergy(treasury) / UPKEEP_PER_TILE));
      if (funded > 0) treasury = chargeEnergy(treasury, funded * UPKEEP_PER_TILE)!; // funded*cost <= maxEnergy
      const byCoherenceDesc = [...owned].sort((a, b) => tiles[b]!.coherence - tiles[a]!.coherence);
      for (const k of byCoherenceDesc.slice(funded)) {
        const t = tiles[k]!;
        const coherence = Math.max(0, t.coherence - 1);
        // A tile starved to Coherence 0 loses its alignment — it goes neutral.
        tiles[k] = coherence === 0 ? { ...t, coherence, alignment: null } : { ...t, coherence };
        events.push({ type: "starved", cog: cogId, tile: k, coherence });
      }
    }

    // 3. mint (post-drift, post-upkeep coherence) — density×coherence/MINT_DIVISOR,
    //    stochastically rounded to an integer. Tile-less cogs mint nothing.
    if (owned.length > 0) {
      const gained: Treasury = { C: 0, O: 0, Ge: 0, S: 0 };
      for (const k of owned) {
        const t = tiles[k]!;
        gained[t.mineral] += stochasticRound((t.density * t.coherence) / MINT_DIVISOR, rng);
      }
      treasury = addT(treasury, gained);
      events.push({ type: "mint", cog: cogId, gained });
    }

    cogs[cogId] = { ...cog, treasury };
  }

  return { state: { ...drifted, tiles, cogs }, events };
}
