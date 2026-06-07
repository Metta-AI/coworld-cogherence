// Board events (captures, auctions, exploits, first-mover…) grouped by turn,
// newest turn first, under a sticky "Turn N" header.
import React from "react";
import type { TurnEvent } from "../../shared/engine/log";
import type { StampedEvent } from "../net/feed";
import { cogName } from "../colors";

function nameOf(id: string | null): string {
  if (!id) return "—";
  const idx = Number(id.replace(/\D/g, ""));
  return Number.isNaN(idx) ? id : cogName(idx);
}

function eventLine(e: TurnEvent): string {
  switch (e.type) {
    case "capture":
      return `${nameOf(e.to)} captured ${e.tile} · coh ${e.coherence}`;
    case "auction":
      return e.winner ? `heart → ${nameOf(e.winner)} @ ${e.price}` : "heart unsold";
    case "exploit":
      return `${nameOf(e.cog)} exploited ${e.tile} (+${e.minted} ${e.mineral})`;
    case "transfer":
      return `${nameOf(e.from)} → ${nameOf(e.to)}: ${e.amount} ${e.mineral}`;
    case "starved":
      return `${nameOf(e.cog)} starved ${e.tile}`;
    case "firstCommit":
      return `${nameOf(e.cog)} committed first ⚡ +${e.reward} ${e.mineral}`;
    case "rejected":
      return `${nameOf(e.cog)} order rejected`;
    default:
      return e.type;
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

export function ActivityTicker({ events }: { events: StampedEvent[] }): React.ReactElement {
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
                {g.events.map((e, i) => (
                  <li key={i} className={`ev ev-${e.type}`}>
                    {eventLine(e)}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
