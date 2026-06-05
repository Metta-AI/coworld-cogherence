// The roster panel: who's playing — a color swatch + display name per Cog, with
// the territory (tiles aligned to that Cog) it currently holds. Identity to the
// Hud's economy: hearts/energy live there, land lives here.
import React from "react";
import type { GameSnapshot } from "../shared/snapshot";
import { cogColor, cogName } from "./colors";

export function Roster({ snapshot }: { snapshot: GameSnapshot }): React.ReactElement {
  const tilesByCog = new Map<string, number>();
  for (const t of snapshot.tiles) {
    if (t.alignment != null) tilesByCog.set(t.alignment, (tilesByCog.get(t.alignment) ?? 0) + 1);
  }

  return (
    <div className="roster" data-testid="roster">
      <h2>Roster</h2>
      <ul>
        {snapshot.cogs.map((c) => (
          <li key={c.id} data-testid={`roster-${c.id}`}>
            <span className="roster-swatch" style={{ background: cogColor(c.index) }} aria-hidden />
            <span className="roster-name">{cogName(c.index)}</span>
            <span className="roster-tiles" title="tiles aligned">
              ⬡ {tilesByCog.get(c.id) ?? 0}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
