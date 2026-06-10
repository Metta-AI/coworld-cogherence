// Spectator (hero broadcast): a three-column grid — roster + heart auction on the
// left, the living lattice in the center, the resolve log + public/DM channels on
// the right. The side panels are drag-resizable (widths persist to localStorage).
import React, { useState } from "react";
import type { GameSnapshot } from "../../shared/snapshot";
import type { Message } from "../../shared/messages";
import type { StampedEvent } from "../net/feed";
import type { LatticeMode } from "../HexBoard";
import { Roster } from "../Roster";
import { AuctionPanel, TurnLog, Channels, LatticePanel } from "../cg/panels";
import { ResizableColumns } from "../cg/ResizableColumns";

export function GlobalView({
  snapshot,
  events,
  messages,
  onSeekTurn,
  live = false,
}: {
  snapshot: GameSnapshot;
  events: StampedEvent[];
  messages: Message[];
  onSeekTurn?: (turn: number) => void;
  live?: boolean;
}): React.ReactElement {
  const [mode, setMode] = useState<LatticeMode>("coherence");
  // Clicking a roster cog spotlights its territory on the lattice (toggle).
  const [focus, setFocus] = useState<string | null>(null);
  const toggleFocus = (id: string): void => setFocus((f) => (f === id ? null : id));
  return (
    <div className="cg-view cg-spectator" data-testid="global-view">
      <ResizableColumns
        storageKey="cg.cols.spectator"
        defaultLeft={300}
        defaultRight={332}
        left={
          <div className="cg-col">
            <Roster snapshot={snapshot} events={events} focus={focus} onToggleFocus={toggleFocus} live={live} />
            <AuctionPanel snapshot={snapshot} events={events} />
          </div>
        }
        center={<LatticePanel snapshot={snapshot} events={events} mode={mode} setMode={setMode} highlight={focus} />}
        right={
          <div className="cg-col">
            <TurnLog snapshot={snapshot} events={events} />
            <Channels messages={messages} onSeekTurn={onSeekTurn} />
          </div>
        }
      />
    </div>
  );
}
