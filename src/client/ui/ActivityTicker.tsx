// Board events (captures, auctions, exploits, first-mover…) grouped by turn,
// newest turn first, under a sticky "Turn N" header. Cog names render in their
// color; hovering a row that names a cell cross-highlights it on the map.
import React from "react";
import type { TurnEvent } from "../../shared/engine/log";
import type { StampedEvent } from "../net/feed";
import { cogColor, cogName } from "../colors";

const cogIdx = (id: string): number => {
  const n = Number(id.replace(/\D/g, ""));
  return Number.isNaN(n) ? 0 : n;
};

/** A cog's display name in its color (em-dash for an empty/neutral slot). */
function Cog({ id }: { id: string | null }): React.ReactElement {
  if (!id) return <span className="ev-cog ev-cog-none">—</span>;
  const i = cogIdx(id);
  return (
    <span className="ev-cog" style={{ color: cogColor(i) }}>
      {cogName(i)}
    </span>
  );
}

const Tile = ({ k }: { k: string }): React.ReactElement => <span className="ev-tile">{k}</span>;

/** The hex key (`q,r`) a row refers to, if any — drives the map cross-highlight. */
function tileOf(e: TurnEvent): string | null {
  return e.type === "capture" || e.type === "exploit" || e.type === "starved" ? e.tile : null;
}

function EventLine({ e }: { e: TurnEvent }): React.ReactElement {
  switch (e.type) {
    case "capture":
      return (
        <>
          <Cog id={e.to} /> captured <Tile k={e.tile} /> · coh {e.coherence}
        </>
      );
    case "auction":
      return e.winner ? (
        <>
          heart → <Cog id={e.winner} /> @ {e.price}
        </>
      ) : (
        <>heart unsold</>
      );
    case "exploit":
      return (
        <>
          <Cog id={e.cog} /> exploited <Tile k={e.tile} /> (+{e.minted} {e.mineral})
        </>
      );
    case "transfer":
      return (
        <>
          <Cog id={e.from} /> → <Cog id={e.to} />: {e.amount} {e.mineral}
        </>
      );
    case "starved":
      return (
        <>
          <Cog id={e.cog} /> starved <Tile k={e.tile} />
        </>
      );
    case "firstCommit":
      return (
        <>
          <Cog id={e.cog} /> committed first ⚡ +{e.reward} {e.mineral}
        </>
      );
    case "rejected":
      return (
        <>
          <Cog id={e.cog} /> order rejected
        </>
      );
    default:
      return <>{e.type}</>;
  }
}

/** Most-recent (non-mint) events grouped into turns, newest first, with the newest
 *  event at the top of each turn. */
function recentGroups(events: StampedEvent[]): { turn: number; events: TurnEvent[] }[] {
  const recent = events.filter((e) => e.event.type !== "mint").slice(-40);
  const groups: { turn: number; events: TurnEvent[] }[] = [];
  for (const { turn, event } of recent) {
    const last = groups[groups.length - 1];
    if (last && last.turn === turn) last.events.push(event);
    else groups.push({ turn, events: [event] });
  }
  groups.reverse(); // newest turn first
  for (const g of groups) g.events.reverse(); // newest event first within a turn
  return groups;
}

export function ActivityTicker({
  events,
  onHoverTile,
}: {
  events: StampedEvent[];
  /** Called with a hex key while a row naming a cell is hovered, null on leave. */
  onHoverTile?: (key: string | null) => void;
}): React.ReactElement {
  const groups = recentGroups(events);
  return (
    <div className="ticker panel" data-testid="ticker">
      <h2>Activity</h2>
      {groups.length === 0 ? (
        <div className="muted">No events yet.</div>
      ) : (
        <div className="ticker-list">
          {groups.map((g) => (
            <section key={g.turn} className="ev-group">
              <header className="ev-turn-head">Turn {g.turn}</header>
              <ul className="ev-rows">
                {g.events.map((e, i) => {
                  const tile = tileOf(e);
                  return (
                    <li
                      key={i}
                      className={`ev ev-${e.type}${tile ? " has-tile" : ""}`}
                      onMouseEnter={onHoverTile ? () => onHoverTile(tile) : undefined}
                      onMouseLeave={onHoverTile ? () => onHoverTile(null) : undefined}
                    >
                      <EventLine e={e} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
