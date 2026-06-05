// The negotiation feed: every message the Cogs send — public broadcasts and
// (where visible) DMs — as a live chat console. The politics on display.
import React from "react";
import type { Message } from "../../shared/messages";
import { cogColor, cogName } from "../colors";

const idx = (id: string): number => Number(id.replace(/\D/g, "")) || 0;
const nameOf = (id: string): string => cogName(idx(id));

export function FeedView({ messages }: { messages: Message[] }): React.ReactElement {
  return (
    <div className="view view-feed" data-testid="feed">
      <div className="panel chat-panel">
        <h2>Negotiation feed</h2>
        <ul className="chat">
          {messages.length === 0 && <li className="muted">No messages yet — the Cogs haven't spoken.</li>}
          {messages.map((m) => (
            <li key={m.seq} className={`chat-msg ${m.to === "public" ? "msg-public" : "msg-dm"}`}>
              <span className="chat-turn">t{m.turn}</span>
              <span className="chat-from" style={{ color: cogColor(idx(m.from)) }}>
                {nameOf(m.from)}
              </span>
              <span className="chat-to">{m.to === "public" ? "to all" : `→ ${nameOf(m.to)}`}</span>
              <span className="chat-text">{m.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
