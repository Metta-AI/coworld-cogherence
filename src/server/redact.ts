// Per-observer projection of a snapshot: the board + everyone's hearts are public,
// but only the viewer sees its own treasury/energy. One redaction path for live +
// replay + fog of war. (Message redaction is added in Phase C.)
import type { CogId } from "../shared/engine/types";
import type { GameSnapshot } from "../shared/snapshot";
import type { TurnEvent } from "../shared/engine/log";

export function buildCogSnapshot(snap: GameSnapshot, viewer: CogId): GameSnapshot {
  return {
    ...snap,
    cogs: snap.cogs.map((c) =>
      c.id === viewer ? c : { ...c, treasury: { C: 0, O: 0, Ge: 0, S: 0 }, energy: 0 },
    ),
  };
}

/** Per-viewer projection of a turn event: bids are SEALED. A rival's bid order
 *  never reaches a cog's feed (null = drop), and the auction settle keeps only
 *  the viewer's own entry in `bids` — the winner and the clearing price (the
 *  second price actually paid) stay public. The global view sees everything. */
export function redactEventFor(event: TurnEvent, viewer: CogId): TurnEvent | null {
  if (event.type === "order" && event.order.type === "bid" && event.cog !== viewer) return null;
  if (event.type === "auction") return { ...event, bids: event.bids.filter(([id]) => id === viewer) };
  return event;
}
