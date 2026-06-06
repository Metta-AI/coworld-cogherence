// A single Cog's console: its (redacted) board view, its stats, its private
// inbox (public + its DMs), and what its model saw + decided.
import React from "react";
import type { GameSnapshot } from "../../shared/snapshot";
import type { Message } from "../../shared/messages";
import { HexBoard } from "../HexBoard";
import { cogColor, cogName } from "../colors";
import { PromptsPanel } from "../PromptsPanel";
import { SteeringPanel } from "./SteeringPanel";
import type { ActPromptFrame } from "../net/feed";

const idx = (id: string): number => Number(id.replace(/\D/g, "")) || 0;

export function CogView({
  snapshot,
  cogId,
  actPrompts,
  messages,
  live = false,
}: {
  snapshot: GameSnapshot;
  cogId: string;
  actPrompts: Record<string, ActPromptFrame[]>;
  messages: Message[];
  live?: boolean;
}): React.ReactElement {
  const i = idx(cogId);
  const me = snapshot.cogs.find((c) => c.id === cogId);
  const inbox = messages.filter((m) => m.to === "public" || m.from === cogId || m.to === cogId);
  const mine: Record<string, ActPromptFrame[]> = actPrompts[cogId] ? { [cogId]: actPrompts[cogId]! } : {};
  return (
    <div className="view view-cog" data-testid="cog-view">
      <div className="board-col">
        <div className="cog-banner" style={{ borderColor: cogColor(i) }}>
          <span className="cog-swatch" style={{ background: cogColor(i) }} />
          <span className="cog-title">{cogName(i)}</span>
          {me && (
            <span className="cog-stat">
              ♥{me.hearts} · ⚡{me.energy} · C{me.treasury.C} O{me.treasury.O} Ge{me.treasury.Ge} S{me.treasury.S}
            </span>
          )}
        </div>
        <div className="panel board-panel">
          <HexBoard snapshot={snapshot} />
        </div>
      </div>
      <aside className="side-col">
        {live && <SteeringPanel cogId={cogId} />}
        <div className="panel inbox" data-testid="inbox">
          <h2>Inbox</h2>
          <ul className="chat">
            {inbox.length === 0 && <li className="muted">No messages.</li>}
            {inbox.map((m) => (
              <li key={m.seq} className={`chat-msg ${m.to === "public" ? "msg-public" : "msg-dm"}`}>
                <span className="chat-from" style={{ color: cogColor(idx(m.from)) }}>
                  {cogName(idx(m.from))}
                </span>
                <span className="chat-to">{m.to === "public" ? "all" : m.to === cogId ? "you" : `→ ${cogName(idx(m.to))}`}</span>
                <span className="chat-text">{m.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <PromptsPanel actPrompts={mine} />
        </div>
      </aside>
    </div>
  );
}
