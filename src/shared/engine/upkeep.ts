// The Upkeep phase: after Resolve, every Cog pays for its ground — and the
// NEIGHBORS move Coherence. Each tile's bill is just the empire-scaled base
// (floor(sqrt(tiles owned)) — sprawl taxes itself), funded heartland-first.
// Resistance costs no energy: every Upkeep a tile's coherence shifts by
// (+1 per allied neighbor) − (1 per enemy neighbor), clamped 0..COHERENCE_MAX —
// neutral neighbors count for nothing. The ally bonus rides on a PAID bill;
// an unpaid tile still suffers the enemy drain but gets no healing. At 0 the
// tile goes neutral. Aligned tiles then mint their mineral at
// density×coherence. Pure: the input state is never mutated.

import type { GameState, CogId, HexKey, Tile, Treasury, CogState } from "./types";
import { neighbors, key } from "./hex";
import { COHERENCE_MAX, mintOf, upkeepBase } from "./constants";

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
 * The Upkeep phase: (1) bill every owned tile its empire-scaled base and pay
 * heartland-first; (2) NEIGHBOR PRESSURE: each tile's coherence shifts by
 * (paid ? allies : 0) − enemies, clamped 0..COHERENCE_MAX (at 0 the tile goes
 * neutral); (3) mint floor(density × coherence / 10) of each aligned tile's
 * mineral. Pure.
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
    let energy = cog.energy;
    const owned = ownedBy.get(cogId)!;

    // count neighbors from the pre-upkeep snapshot (simultaneous across cogs)
    const friendlyOf = new Map<HexKey, number>();
    const enemiesOf = new Map<HexKey, number>();
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
      friendlyOf.set(k, friendly);
      enemiesOf.set(k, enemies);
    }
    const desc = [...owned].sort((a, b) => state.tiles[b]!.coherence - state.tiles[a]!.coherence);

    // 1. the empire-scaled base bill, heartland first, from STORED energy
    //    (resistance bills nothing; minerals don't spend — they convert)
    const base = upkeepBase(owned.length);
    const paid = new Set<HexKey>();
    for (const k of desc) {
      if (energy >= base) {
        energy -= base;
        paid.add(k);
      }
    }

    // 2. neighbor pressure: +1 per ally (paid bills only) − 1 per enemy, net,
    //    clamped 0..COHERENCE_MAX — a tile ground to 0 goes neutral.
    for (const k of desc) {
      const t = tiles[k]!;
      const delta = (paid.has(k) ? friendlyOf.get(k)! : 0) - enemiesOf.get(k)!;
      const coherence = Math.max(0, Math.min(COHERENCE_MAX, t.coherence + delta));
      if (coherence === t.coherence) continue;
      tiles[k] = coherence === 0 ? { ...t, coherence, alignment: null } : { ...t, coherence };
      if (delta < 0) events.push({ type: "starved", cog: cogId, tile: k, coherence });
      if (coherence === 0) events.push({ type: "lost", cog: cogId, tile: k });
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

    cogs[cogId] = { ...cog, treasury, energy };
  }

  return { state: { ...state, tiles, cogs }, events };
}
