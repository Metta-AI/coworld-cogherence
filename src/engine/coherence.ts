// The emergent neighbor-drift rule at the heart of Cogherence, applied each
// Upkeep. From this one majority check fall out fortress-interiors,
// rotting salients, and the value of clean borders. Pure and order-independent.

import type { CogId, GameState, Tile } from "./types";
import { neighbors, key } from "./hex";
import { COHERENCE_MAX } from "./constants";

/**
 * Coherence drift — the emergent "entropy" rule, applied each Upkeep.
 *
 * Each aligned tile counts its in-board neighbors (neighbors absent from the
 * board are not counted). A strict majority sharing its alignment raises
 * Coherence by 1 (capped at COHERENCE_MAX); otherwise it falls by 1 (floored
 * at 0). Neutral tiles never drift. Computed from a snapshot of `state` and
 * pure — the input is never mutated.
 */
export function applyDrift(state: GameState): GameState {
  const tiles: Record<string, Tile> = {};
  for (const [k, tile] of Object.entries(state.tiles)) {
    if (tile.alignment === null) {
      tiles[k] = tile;
      continue;
    }
    let inBoard = 0;
    let same = 0;
    for (const n of neighbors(tile.hex)) {
      const nt = state.tiles[key(n)];
      if (!nt) continue;
      inBoard++;
      if (nt.alignment === tile.alignment) same++;
    }
    const majority = same * 2 > inBoard; // strict majority of in-board neighbors
    const delta = majority ? 1 : -1;
    const coherence = Math.max(0, Math.min(COHERENCE_MAX, tile.coherence + delta));
    tiles[k] = { ...tile, coherence };
  }
  return { ...state, tiles };
}

/**
 * Align tug-of-war for a single tile (the pure math of the Resolve phase).
 *
 * Coherence = margin of dominance. Each alignment's force = the incumbent's
 * standing Coherence (defending its CURRENT alignment) plus the summed Align
 * energy committed toward that alignment. The highest force wins; the new
 * Coherence is the winner's force minus the next-highest opposing force
 * (capped at COHERENCE_MAX). A tie for the top => mutual annihilation: the
 * tile goes neutral at 0. With no forces at all, the tile is unchanged.
 */
export function resolveTile(
  incumbent: CogId | null,
  incumbentCoherence: number,
  aligns: ReadonlyArray<readonly [CogId, number]>,
): { alignment: CogId | null; coherence: number } {
  const force = new Map<CogId, number>();
  if (incumbent !== null) force.set(incumbent, incumbentCoherence);
  for (const [cog, energy] of aligns) force.set(cog, (force.get(cog) ?? 0) + energy);

  if (force.size === 0) return { alignment: incumbent, coherence: incumbentCoherence };

  let top = -Infinity;
  for (const f of force.values()) if (f > top) top = f;

  let second = 0;
  let topCog: CogId | null = null;
  let topCount = 0;
  for (const [cog, f] of force) {
    if (f === top) {
      topCount++;
      if (topCog === null) topCog = cog;
    } else if (f > second) {
      second = f;
    }
  }

  if (topCount > 1) return { alignment: null, coherence: 0 };
  const coherence = Math.max(0, Math.min(COHERENCE_MAX, top - second));
  return { alignment: topCog, coherence };
}
