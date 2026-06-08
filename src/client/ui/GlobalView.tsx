// Spectator (hero broadcast): the Commons meter, then a three-column grid —
// roster + heart auction on the left, the living lattice in the center, the
// resolve log + public/DM channels on the right.
import React, { useState } from "react";
import type { GameSnapshot } from "../../shared/snapshot";
import type { Message } from "../../shared/messages";
import type { StampedEvent } from "../net/feed";
import type { LatticeMode } from "../HexBoard";
import { Roster } from "../Roster";
import { CommonsStrip, AuctionPanel, ResolveLog, Channels, LatticePanel } from "../cg/panels";

export function GlobalView({
  snapshot,
  events,
  messages,
  onSeekTurn,
}: {
  snapshot: GameSnapshot;
  events: StampedEvent[];
  messages: Message[];
  onSeekTurn?: (turn: number) => void;
}): React.ReactElement {
  const [mode, setMode] = useState<LatticeMode>("coherence");
  return (
    <div className="cg-view cg-spectator" data-testid="global-view">
      <CommonsStrip snapshot={snapshot} />
      <div className="cg-grid cg-grid-spectator">
        <div className="cg-col">
          <Roster snapshot={snapshot} />
          <AuctionPanel snapshot={snapshot} events={events} />
        </div>
        <LatticePanel snapshot={snapshot} events={events} mode={mode} setMode={setMode} />
        <div className="cg-col">
          <ResolveLog snapshot={snapshot} events={events} />
          <Channels messages={messages} onSeekTurn={onSeekTurn} />
        </div>
      </div>
    </div>
  );
}
