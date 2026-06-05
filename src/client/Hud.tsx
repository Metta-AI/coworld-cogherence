// Per-turn readouts: the turn/commons line and a per-cog hearts/energy list.
import React from "react";
import type { GameSnapshot } from "../shared/snapshot";
import { cogColor, cogName } from "./colors";

export function Hud({ snapshot }: { snapshot: GameSnapshot }): React.ReactElement {
  return (
    <div className="hud">
      <div data-testid="turn-label">
        Turn {snapshot.turn} / commons {snapshot.commons}
      </div>
      <ul>
        {snapshot.cogs.map((c) => (
          <li key={c.id} style={{ color: cogColor(c.index) }}>
            {cogName(c.index)}: ♥{c.hearts} ⚡{c.energy}
          </li>
        ))}
      </ul>
    </div>
  );
}
