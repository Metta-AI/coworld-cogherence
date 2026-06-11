// Energy is STORED — the only spendable currency. Minerals are trade goods;
// the one bridge between them is CONVERSION: a full COGS set (1×C + 1×O +
// 1×Ge + 1×S) burns together for SET_ENERGY. Loose singles have no direct
// energy value — balance your treasury (or trade) to form sets.

import type { Treasury } from "./types";
import { MINERALS } from "./types";
import { SET_ENERGY } from "./constants";

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
