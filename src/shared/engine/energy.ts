// Energy is STORED — the only spendable currency. Minerals are trade goods;
// the bridge between them is EXPLICIT CONVERSION: a full COGS set (1×C +
// 1×O + 1×Ge + 1×S) burns together for SET_ENERGY, and a single mineral
// burns for SINGLE_ENERGY — a quarter of the set rate, so balance (or trade)
// stays king.

import type { Treasury } from "./types";
import { MINERALS } from "./types";
import { SET_ENERGY, SINGLE_ENERGY } from "./constants";

/** How many complete COGS sets a treasury holds (limited by its scarcest mineral). */
export const fullSets = (t: Treasury): number => Math.min(...MINERALS.map((m) => t[m]));

/** Burn `sets` full COGS sets for energy: the new treasury + the energy gained,
 *  or null when the treasury doesn't hold that many sets. */
export function convertSets(t: Treasury, sets: number): { treasury: Treasury; gained: number } | null {
  if (sets < 1 || fullSets(t) < sets) return null;
  const treasury: Treasury = { ...t };
  for (const m of MINERALS) treasury[m] -= sets;
  return { treasury, gained: sets * SET_ENERGY };
}

/** Burn `count` units of one mineral for energy (SINGLE_ENERGY each), or null
 *  when the treasury doesn't hold that many. */
export function convertMineral(t: Treasury, mineral: keyof Treasury, count: number): { treasury: Treasury; gained: number } | null {
  if (count < 1 || t[mineral] < count) return null;
  return { treasury: { ...t, [mineral]: t[mineral] - count }, gained: count * SINGLE_ENERGY };
}

/** Energy a treasury is worth if fully liquidated: sets first (best rate),
 *  then every leftover as a single. Display/scoring helper — converting is
 *  always an explicit act. */
export function convertibleEnergy(t: Treasury): number {
  const sets = fullSets(t);
  const leftover = MINERALS.reduce((s, m) => s + (t[m] - sets), 0);
  return sets * SET_ENERGY + leftover * SINGLE_ENERGY;
}
