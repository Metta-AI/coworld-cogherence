// The per-turn record stored in GameState.log: a flattened list of the Resolve-
// and Upkeep-phase events plus the post-turn Commons meter and per-Cog hearts,
// enough to drive replay / spectator views. Types only (`import type`), so the
// type-level cycle types.ts <-> log.ts <-> resolve/upkeep erases at runtime.

import type { CogId } from "./types";
import type { ResolveEvent } from "./resolve";
import type { UpkeepEvent } from "./upkeep";

/** A single Resolve- or Upkeep-phase event within a turn. */
export type TurnEvent = ResolveEvent | UpkeepEvent;

/** The record of one completed turn, appended to GameState.log (for replay / spectator). */
export interface TurnRecord {
  turn: number;
  events: TurnEvent[];
  /** Total Coherence across the lattice after the turn (the visible "Commons" meter). */
  commons: number;
  /** Hearts per Cog after the turn. */
  hearts: Record<CogId, number>;
}
