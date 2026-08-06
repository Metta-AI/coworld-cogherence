// Per-observer projection of cogherence's view, used by the @cogweb seam's
// `redact`: the board + everyone's hearts are public, but a seat sees only its own
// treasury/energy, and a rival's sealed bid never reaches its feed.
import type { CogId } from "../shared/engine/types.js";
import type { GameSnapshot } from "../shared/snapshot.js";
import type { TurnEvent } from "../shared/engine/log.js";

/** Redact a snapshot for one viewer: zero out every other cog's treasury + energy. */
export function buildCogSnapshot(snap: GameSnapshot, viewer: CogId): GameSnapshot {
  return {
    ...snap,
    cogs: snap.cogs.map((c) => (c.id === viewer ? c : { ...c, treasury: { C: 0, O: 0, Ge: 0, S: 0 }, energy: 0 })),
  };
}

/** Per-viewer projection of a turn event: bids are SEALED. A rival's bid order
 *  never reaches a cog's feed (null = drop), and the auction settle keeps only the
 *  viewer's own entry in `bids` — the winner and the clearing (second) price stay
 *  public. The global view (`redact(state, null)`) sees everything. */
export function redactEventFor(event: TurnEvent, viewer: CogId): TurnEvent | null {
  if (event.type === "order" && event.order.type === "bid" && event.cog !== viewer) return null;
  if (event.type === "auction") return { ...event, bids: event.bids.filter(([id]) => id === viewer) };
  return event;
}
