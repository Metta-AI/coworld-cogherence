// The per-turn record stored in GameState.log: a flattened list of the Resolve-
// and Upkeep-phase events plus the post-turn per-Cog hearts, enough to drive
// replay / spectator views. Types only (`import type`), so the type-level
// cycle types.ts <-> log.ts <-> resolve/upkeep erases at runtime.

import type { CogId } from "./types";
import type { Order } from "./orders";
import type { ResolveEvent } from "./resolve";
import type { UpkeepEvent } from "./upkeep";

/** A Commit-phase order exactly as played — recorded so the Turn Log can pair
 *  every action with its consequences (or its failure). */
export interface OrderEvent {
  type: "order";
  cog: CogId;
  order: Order;
}

/** A single order / Resolve- / Upkeep-phase event within a turn. */
export type TurnEvent = OrderEvent | ResolveEvent | UpkeepEvent;

/** The record of one completed turn, appended to GameState.log (for replay / spectator). */
export interface TurnRecord {
  turn: number;
  events: TurnEvent[];
  /** Hearts per Cog after the turn. */
  hearts: Record<CogId, number>;
}
