// The emergent neighbor-drift rule at the heart of Cogherence, applied each
// Upkeep. From this one majority check fall out fortress-interiors,
// rotting salients, and the value of clean borders. Pure and order-independent.

import type { GameState, Tile } from "./types";
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
