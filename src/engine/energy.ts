// The economic core: minerals convert to energy on demand. Energy is never
// stored — it is always derived from a treasury when a system needs to spend.
// The conversion rule is the COGS set: 1×C + 1×O + 1×Ge + 1×S burns together
// for SET_ENERGY (10, the best rate at 2.5/mineral); any single leftover
// mineral burns for 1. Orders budgeting, Upkeep, and the auction all charge
// energy through `chargeEnergy`, so its set-vs-single accounting is load-bearing.

import type { Treasury, Mineral } from "./types";
import { MINERALS } from "./types";
import { SET_ENERGY, SINGLE_ENERGY } from "./constants";

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
  return sets * SET_ENERGY + leftover * SINGLE_ENERGY;
}

/**
 * Spend minerals from `t` to cover `need` energy, returning the remaining
 * treasury (a copy; `t` is untouched), or `null` if it cannot be afforded.
 *
 * Affordability is monotonic: a need is affordable iff `maxEnergy(t) >= need`,
 * so a Cog that can afford some need N can afford every need ≤ N. (This is
 * required by the second-price heart auction, where a Cog bids B but pays a
 * lower clearing price P ≤ B.)
 *
 * Minerals are lumpy: a COGS set converts all-or-nothing for SET_ENERGY. We
 * greedily burn whole sets while the remaining need is still ≥ SET_ENERGY, then
 * top up with loose singles (taken from the largest pile first, preserving
 * set-balance so future conversions can still form sets). Small needs spend
 * only singles. When loose singles can't cover a sub-SET_ENERGY remainder, a
 * whole set is burned instead — overshooting the energy granted, but keeping
 * affordability monotonic; this can only happen when a set is available.
 */
export function chargeEnergy(t: Treasury, need: number): Treasury | null {
  if (maxEnergy(t) < need) return null;
  const out: Treasury = { ...t };
  let granted = 0;
  while (granted < need) {
    const remaining = need - granted;
    const minerals = MINERALS.reduce((s, m) => s + out[m], 0);
    if (remaining >= SET_ENERGY && fullSets(out) > 0) {
      // efficient: a whole set covers >= 10 of the remaining need
      for (const m of MINERALS) out[m] -= 1;
      granted += SET_ENERGY;
    } else if (minerals >= remaining) {
      // loose minerals can finish the job as singles; spend from the largest pile
      const m: Mineral = MINERALS.reduce((a, b) => (out[a] >= out[b] ? a : b));
      out[m] -= 1;
      granted += SINGLE_ENERGY;
    } else {
      // remaining < SET_ENERGY but singles can't reach it: burn a set (overshoot).
      // fullSets(out) > 0 is guaranteed here because maxEnergy(out) >= remaining.
      for (const m of MINERALS) out[m] -= 1;
      granted += SET_ENERGY;
    }
  }
  return out;
}
