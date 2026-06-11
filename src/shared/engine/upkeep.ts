// The Upkeep phase: after Resolve, every Cog pays for its ground — and Coherence
// is purely economic. Each tile's bill: a base of floor(sqrt(tiles owned)) —
// empire scale taxes itself — plus RESISTANCE per enemy neighbor; allies do NOT
// cheapen defense, and neutral neighbors count for nothing (tileUpkeepCost).
// Heartland is funded first (descending coherence). An unpaid tile UNDER
// resistance loses 1 Coherence (and goes neutral at 0) — zero-resistance ground
// holds even when the wallet runs dry, so collapse stays localized to
// frontiers. Allies buy healing speed instead: a paid tile may regenerate up to
// maxRegen(allies) = 1 + allies/2 Coherence per turn, each +1 costing
// REGEN_COST. Aligned tiles then mint their mineral at density×coherence.
// Pure: the input state is never mutated.

import type { GameState, CogId, HexKey, Tile, Treasury, CogState } from "./types";
import { neighbors, key } from "./hex";
import { chargeEnergy, maxEnergy } from "./energy";
import { COHERENCE_MAX, REGEN_COST, maxRegen, mintOf, tileUpkeepCost } from "./constants";

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

/**
 * The Upkeep phase: (1) bill every owned tile via tileUpkeepCost and pay base
 * upkeep heartland-first — unpaid tiles UNDER resistance lose 1 Coherence
 * (neutral at 0) while zero-resistance tiles hold;
 * (2) with what's left, regenerate strongest-first: each +1 Coherence costs
 * REGEN_COST, up to maxRegen(allied neighbors) per tile per turn, capped at
 * COHERENCE_MAX; (3) mint floor(density × coherence / 10) of each aligned tile's mineral.
 * Pure.
 */
export function upkeep(state: GameState): { state: GameState; events: UpkeepEvent[] } {
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
    const friendlyOf = new Map<HexKey, number>(); // allies set the regen ceiling
    const sheltered = new Set<HexKey>(); // zero resistance: no enemy neighbors
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
      costs.set(k, tileUpkeepCost(enemies, owned.length));
      friendlyOf.set(k, friendly);
      if (enemies === 0) sheltered.add(k);
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

    // 2. regen: REGEN_COST per +1 Coherence on top of a paid bill, up to
    //    maxRegen(allies) steps per tile, strongest first — a flat price, so
    //    once it's unaffordable we're done.
    for (const k of desc) {
      if (!paid.has(k)) continue;
      const t = tiles[k]!;
      const cap = Math.min(maxRegen(friendlyOf.get(k)!), COHERENCE_MAX - t.coherence);
      let bought = 0;
      while (bought < cap && maxEnergy(treasury) >= REGEN_COST) {
        treasury = chargeEnergy(treasury, REGEN_COST)!;
        bought++;
      }
      if (bought > 0) tiles[k] = { ...t, coherence: t.coherence + bought };
      if (maxEnergy(treasury) < REGEN_COST) break;
    }

    // 3. mint (post-upkeep coherence) — floor(density × coherence / 10) per
    //    tile still aligned, deterministic. Tile-less cogs mint nothing.
    const stillMine = owned.filter((k) => tiles[k]!.alignment === cogId);
    if (stillMine.length > 0) {
      const gained: Treasury = { C: 0, O: 0, Ge: 0, S: 0 };
      for (const k of stillMine) {
        const t = tiles[k]!;
        gained[t.mineral] += mintOf(t.density, t.coherence);
      }
      treasury = addT(treasury, gained);
      events.push({ type: "mint", cog: cogId, gained });
    }

    cogs[cogId] = { ...cog, treasury };
  }

  return { state: { ...state, tiles, cogs }, events };
}
