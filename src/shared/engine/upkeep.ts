// The Upkeep phase: after Resolve, the world "breathes". Coherence drifts by the
// neighbor rule — losses are free, but each +1 GAIN drains DRIFT_GAIN_COST energy
// (strongest tiles funded first; unaffordable gains are forfeited). Each Cog then
// pays to hold its tiles at a rate that scales with empire size (upkeepPerTile),
// heartland funded first, the frontier rotting when energy runs short. Finally
// aligned tiles mint their mineral at density×coherence. The LOCKED order —
// drift, then cost, then mint — makes minting use post-drift, post-upkeep
// coherence. Pure: the input state is never mutated.

import type { GameState, CogId, HexKey, Tile, Treasury, CogState } from "./types";
import { driftDirection } from "./coherence";
import { chargeEnergy, maxEnergy } from "./energy";
import { makeRng } from "./rng";
import { MINT_DIVISOR, COHERENCE_MAX, DRIFT_GAIN_COST, upkeepPerTile } from "./constants";

/** Events emitted by an Upkeep phase (for the turn log / replay). */
export type UpkeepEvent =
  | { type: "starved"; cog: CogId; tile: HexKey; coherence: number }
  /** A tile went NEUTRAL — the owner lost it to entropy (rot) or to an unpaid
   *  upkeep bill (starved). Flips to an enemy are capture events in Resolve. */
  | { type: "lost"; cog: CogId; tile: HexKey; cause: "rot" | "starved" }
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
 * The Upkeep phase: (1) coherence drift — losses free, gains cost DRIFT_GAIN_COST
 * each (strongest first, forfeited when unaffordable); (2) per-Cog upkeep cost at
 * upkeepPerTile(owned) — fund tiles in descending coherence, starve the rest
 * (lowest first, −1 coherence floored at 0); (3) mint density×coherence of each
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

  // group aligned tiles by owner (pre-drift)
  const ownedBy = new Map<CogId, HexKey[]>();
  for (const cogId of state.cogOrder) ownedBy.set(cogId, []);
  for (const [k, t] of Object.entries(state.tiles)) {
    if (t.alignment !== null) ownedBy.get(t.alignment)?.push(k);
  }

  // 1. drift — direction from the pre-drift snapshot (simultaneous). Losses are
  //    free (a tile eroding to 0 goes neutral); each +1 gain drains
  //    DRIFT_GAIN_COST from the owner, strongest tiles first, and a gain the
  //    owner can't pay for simply doesn't happen.
  for (const cogId of state.cogOrder) {
    const cog = state.cogs[cogId];
    if (!cog) continue;
    let treasury = cog.treasury;
    const gainers: HexKey[] = [];
    for (const k of ownedBy.get(cogId)!) {
      const t = state.tiles[k]!;
      if (driftDirection(state, t) < 0) {
        const coherence = Math.max(0, t.coherence - 1);
        if (coherence === 0) {
          tiles[k] = { ...t, coherence, alignment: null };
          events.push({ type: "lost", cog: cogId, tile: k, cause: "rot" });
        } else {
          tiles[k] = { ...t, coherence };
        }
      } else if (t.coherence < COHERENCE_MAX) {
        gainers.push(k);
      }
    }
    gainers.sort((a, b) => state.tiles[b]!.coherence - state.tiles[a]!.coherence);
    for (const k of gainers) {
      if (maxEnergy(treasury) < DRIFT_GAIN_COST) break;
      treasury = chargeEnergy(treasury, DRIFT_GAIN_COST)!;
      tiles[k] = { ...state.tiles[k]!, coherence: state.tiles[k]!.coherence + 1 };
    }
    cogs[cogId] = { ...cog, treasury };
  }

  // regroup post-drift (tiles eroded to neutral drop out)
  const ownedAfter = new Map<CogId, HexKey[]>();
  for (const cogId of state.cogOrder) ownedAfter.set(cogId, []);
  for (const [k, t] of Object.entries(tiles)) {
    if (t.alignment !== null) ownedAfter.get(t.alignment)?.push(k);
  }

  for (const cogId of state.cogOrder) {
    const cog = cogs[cogId];
    if (!cog) continue;
    const owned = ownedAfter.get(cogId)!;
    let treasury = cog.treasury;

    // 2. upkeep cost — the per-tile rate scales with empire size
    if (owned.length > 0) {
      const rate = upkeepPerTile(owned.length);
      const funded = Math.min(owned.length, Math.floor(maxEnergy(treasury) / rate));
      if (funded > 0) treasury = chargeEnergy(treasury, funded * rate)!; // funded*rate <= maxEnergy
      const byCoherenceDesc = [...owned].sort((a, b) => tiles[b]!.coherence - tiles[a]!.coherence);
      for (const k of byCoherenceDesc.slice(funded)) {
        const t = tiles[k]!;
        const coherence = Math.max(0, t.coherence - 1);
        // A tile starved to Coherence 0 loses its alignment — it goes neutral.
        tiles[k] = coherence === 0 ? { ...t, coherence, alignment: null } : { ...t, coherence };
        events.push({ type: "starved", cog: cogId, tile: k, coherence });
        if (coherence === 0) events.push({ type: "lost", cog: cogId, tile: k, cause: "starved" });
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

  return { state: { ...state, tiles, cogs }, events };
}
