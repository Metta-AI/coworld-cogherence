// A reverse-chronological stream of board events (captures, auctions, exploits…).
import React from "react";
import type { TurnEvent } from "../../shared/engine/log";
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

export function ActivityTicker({ events }: { events: TurnEvent[] }): React.ReactElement {
  const recent = events.filter((e) => e.type !== "mint").slice(-40).reverse();
  return (
    <div className="ticker panel" data-testid="ticker">
      <h2>Activity</h2>
      <ul>
        {recent.length === 0 && <li className="muted">No events yet.</li>}
        {recent.map((e, i) => (
          <li key={i} className={`ev ev-${e.type}`}>
            {eventLine(e)}
          </li>
        ))}
      </ul>
    </div>
  );
}
