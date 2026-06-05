// The roster: one card per Cog — color, name, hearts, energy, tiles held, and
// treasury (C/O/Ge/S). Hovering a card reveals hearts + energy sparklines over
// the game so far.
import React from "react";
import type { GameSnapshot } from "../shared/snapshot";
import { cogColor, cogName } from "./colors";
import { Sparkline } from "./ui/Sparkline";

const MINERALS = ["C", "O", "Ge", "S"] as const;

export function Roster({
  snapshot,
  history = [],
}: {
  snapshot: GameSnapshot;
  history?: GameSnapshot[];
}): React.ReactElement {
  const tilesByCog = new Map<string, number>();
  for (const t of snapshot.tiles) {
    if (t.alignment != null) tilesByCog.set(t.alignment, (tilesByCog.get(t.alignment) ?? 0) + 1);
  }
  const seriesFor = (id: string, pick: (c: GameSnapshot["cogs"][number]) => number): number[] =>
    history.map((s) => {
      const c = s.cogs.find((x) => x.id === id);
      return c ? pick(c) : 0;
    });

  return (
    <div className="roster" data-testid="roster">
      <h2>Roster</h2>
      <ul>
        {snapshot.cogs.map((c) => {
          const color = cogColor(c.index);
          return (
            <li key={c.id} className="roster-row" data-testid={`roster-${c.id}`}>
              <div className="roster-main">
                <span className="roster-swatch" style={{ background: color, color }} aria-hidden />
                <span className="roster-name">{cogName(c.index)}</span>
                <span className="roster-stats">
                  <span title="hearts">♥{c.hearts}</span>
                  <span title="energy">⚡{c.energy}</span>
                  <span title="tiles held">⬡{tilesByCog.get(c.id) ?? 0}</span>
                </span>
              </div>
              <div className="roster-pips" aria-label="treasury">
                {MINERALS.map((m) => (
                  <span key={m} className="pip" title={`${m} minerals`}>
                    <em>{m}</em>
                    {c.treasury[m]}
                  </span>
                ))}
              </div>
              <div className="roster-graph">
                <div className="graph-row">
                  <span className="graph-label">hearts</span>
                  <Sparkline values={seriesFor(c.id, (x) => x.hearts)} color={color} />
                </div>
                <div className="graph-row">
                  <span className="graph-label">energy</span>
                  <Sparkline values={seriesFor(c.id, (x) => x.energy)} color="var(--accent-2)" />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
