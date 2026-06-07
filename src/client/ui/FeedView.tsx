// The negotiation feed: every message the Cogs send — public broadcasts and
// (where visible) DMs — as a live chat console, grouped under a header per turn.
import React from "react";
import type { Message } from "../../shared/messages";
import { cogColor, cogName } from "../colors";

const idx = (id: string): number => Number(id.replace(/\D/g, "")) || 0;
const nameOf = (id: string): string => cogName(idx(id));

/** Split the chronological message stream into per-turn groups (negotiation for a
 *  turn arrives contiguously, so consecutive same-turn messages form one group). */
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
    <div className="view view-feed" data-testid="feed">
      <div className="panel chat-panel">
        <h2>Negotiation feed</h2>
        {messages.length === 0 ? (
          <p className="muted">No messages yet — the Cogs haven't spoken.</p>
        ) : (
          <div className="chat">
            {groups.map((g) => (
              <section key={g.turn} className="chat-group">
                <header className="chat-turn-head">Turn {g.turn}</header>
                {g.msgs.map((m) => (
                  <div key={m.seq} className={`chat-msg ${m.to === "public" ? "msg-public" : "msg-dm"}`}>
                    <span className="chat-from" style={{ color: cogColor(idx(m.from)) }}>
                      {nameOf(m.from)}
                    </span>
                    <span className="chat-to">{m.to === "public" ? "to all" : `→ ${nameOf(m.to)}`}</span>
                    <span className="chat-text">{m.text}</span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
