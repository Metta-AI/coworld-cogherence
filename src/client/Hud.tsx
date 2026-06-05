// Per-turn readouts: the turn/commons line and a per-cog economy card
// (hearts, energy, and the C/O/Ge/S treasury) using the neon-glass art icons.
import React from "react";
import type { GameSnapshot } from "../shared/snapshot";
import { MINERALS } from "../shared/engine/types";
import { cogColor, cogName } from "./colors";
import { Icon, type IconName } from "./Icon";

export function Hud({ snapshot }: { snapshot: GameSnapshot }): React.ReactElement {
  return (
    <div className="hud">
      <div className="hud-commons" data-testid="turn-label">
        Turn {snapshot.turn} ·
        <Icon name="coherence" title="Commons — total Coherence on the board" />
        commons {snapshot.commons}
      </div>
      <ul>
        {snapshot.cogs.map((c) => (
          <li key={c.id} style={{ color: cogColor(c.index) }}>
            <span className="hud-name">{cogName(c.index)}</span>
            <span className="hud-stat">
              <Icon name="heart" title="Hearts" />
              {c.hearts}
            </span>
            <span className="hud-stat">
              <Icon name="energy" title="Energy" />
              {c.energy}
            </span>
            <span className="hud-treasury">
              {MINERALS.map((m) => (
                <span className="hud-stat" key={m}>
                  <Icon name={`mineral-${m.toLowerCase()}` as IconName} title={`${m} mineral`} />
                  {c.treasury[m]}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
