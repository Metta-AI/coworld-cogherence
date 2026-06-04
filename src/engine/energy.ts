// The economic core: minerals convert to energy on demand. Energy is never
// stored — it is always derived from a treasury when a system needs to spend.
// The conversion rule is the COGS set: 1×C + 1×O + 1×Ge + 1×S burns together
// for SET_ENERGY (10, the best rate at 2.5/mineral); any single leftover
// mineral burns for 1. Orders budgeting, Upkeep, and the auction all charge
// energy through `chargeEnergy`, so its set-vs-single accounting is load-bearing.

import type { Treasury, Mineral } from "./types";
import { MINERALS } from "./types";
import { SET_ENERGY } from "./constants";

/** How many complete COGS sets a treasury holds (limited by its scarcest mineral). */
const fullSets = (t: Treasury) => Math.min(...MINERALS.map((m) => t[m]));

/**
 * The most energy a treasury can yield if fully converted: each complete COGS
 * set is worth SET_ENERGY, and every leftover mineral (those beyond the set
 * count) is worth 1. This is the ceiling, not a spend — `chargeEnergy` does the
 * actual lumpy conversion for a specific need.
 */
export function maxEnergy(t: Treasury): number {
  const sets = fullSets(t);
  const leftover = MINERALS.reduce((s, m) => s + (t[m] - sets), 0);
  return sets * SET_ENERGY + leftover;
}

/**
 * Spend minerals from `t` to cover `need` energy, returning the remaining
 * treasury (a copy; `t` is untouched), or `null` if it cannot be afforded.
 *
 * Minerals are lumpy: a COGS set converts all-or-nothing for SET_ENERGY, so we
 * greedily burn whole sets only while the remaining need is still ≥ SET_ENERGY,
 * then top up with singles. Singles are taken from the largest pile first, which
 * preserves set-balance (keeps the four piles as even as possible) so future
 * conversions can still form sets.
 */
export function chargeEnergy(t: Treasury, need: number): Treasury | null {
  const out: Treasury = { ...t };
  let granted = 0;
  while (need - granted >= SET_ENERGY && fullSets(out) > 0) {
    for (const m of MINERALS) out[m] -= 1;
    granted += SET_ENERGY;
  }
  while (granted < need) {
    const m: Mineral = MINERALS.reduce((a, b) => (out[a] >= out[b] ? a : b));
    if (out[m] <= 0) return null;
    out[m] -= 1;
    granted += 1;
  }
  return out;
}
