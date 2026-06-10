// The negotiation feed: every message the Cogs send — public broadcasts and
// (where visible) DMs — as a live chat console, grouped under a per-turn header.
import React from "react";
import type { Message } from "../../shared/messages";
import { ChannelMessage } from "../cg/panels";

/** Split the chronological stream into per-turn groups (negotiation for a turn
 *  arrives contiguously, so consecutive same-turn messages form one group). */
function groupByTurn(messages: Message[]): { turn: number; msgs: Message[] }[] {
  const groups: { turn: number; msgs: Message[] }[] = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    if (last && last.turn === m.turn) last.msgs.push(m);
    else groups.push({ turn: m.turn, msgs: [m] });
  }
  return groups;
}

export function FeedView({ messages }: { messages: Message[] }): React.ReactElement {
  const groups = groupByTurn(messages);
  return (
    <div className="cg-view cg-feed" data-testid="feed">
      <div className="cg-panel cg-feed-panel">
        <div className="cg-panel-head">
          <span className="cg-panel-title">Negotiation Feed</span>
          <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>
            public + visible DMs
          </span>
        </div>
        <div className="cg-panel-body cg-scroll" style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {messages.length === 0 ? (
            <p className="cg-mono" style={{ fontSize: 12, color: "var(--muted)" }}>
              No messages yet — the Cogs haven’t spoken.
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.turn} className="cg-feed-group">
                <header className="cg-feed-turn">Turn {g.turn}</header>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {g.msgs.map((m) => (
                    <ChannelMessage key={m.seq} m={m} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
