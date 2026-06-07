// The operator console: the full board + roster, an activity ticker, and the
// act-prompt transparency for every Cog.
import React from "react";
import type { GameSnapshot } from "../../shared/snapshot";
import { HexBoard } from "../HexBoard";
import { Roster } from "../Roster";
import { ActivityTicker } from "./ActivityTicker";
import { PromptsPanel } from "../PromptsPanel";
import type { ActPromptFrame, StampedEvent } from "../net/feed";

export function GlobalView({
  snapshot,
  history,
  events,
  actPrompts,
}: {
  snapshot: GameSnapshot;
  history?: GameSnapshot[];
  events: StampedEvent[];
  actPrompts: Record<string, ActPromptFrame[]>;
}): React.ReactElement {
  return (
    <div className="view view-global" data-testid="global-view">
      <div className="board-col">
        <div className="panel board-panel">
          <HexBoard snapshot={snapshot} />
        </div>
        <Roster snapshot={snapshot} history={history} />
      </div>
      <aside className="side-col">
        <ActivityTicker events={events} />
        <div className="panel">
          <PromptsPanel actPrompts={actPrompts} />
        </div>
      </aside>
    </div>
  );
}
