// The roster: one card per Cog — color, name, hearts, energy, tiles held, the
// treasury (C/O/Ge/S), the projected change next upkeep (mint + upkeep cost),
// and hearts + energy sparklines over the game so far.
import React from "react";
import type { GameSnapshot } from "../shared/snapshot";
import { cogColor, cogName } from "./colors";
import { Sparkline } from "./ui/Sparkline";

const MINERALS = ["C", "O", "Ge", "S"] as const;
const MINT_DIVISOR = 10;

export function Roster({
  snapshot,
  history = [],
}: {
  snapshot: GameSnapshot;
  history?: GameSnapshot[];
}): React.ReactElement {
  // One pass: tiles held + projected this-turn mint (expected density×coherence/10
  // per mineral, the engine's stochastic mint averaged) + upkeep (1 ⚡/tile).
  const stats = new Map<string, { tiles: number; mint: Record<string, number> }>();
  for (const c of snapshot.cogs) stats.set(c.id, { tiles: 0, mint: { C: 0, O: 0, Ge: 0, S: 0 } });
  for (const t of snapshot.tiles) {
    const s = t.alignment != null ? stats.get(t.alignment) : undefined;
    if (s) {
      s.tiles++;
      s.mint[t.mineral]! += (t.density * t.coherence) / MINT_DIVISOR;
    }
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
          const s = stats.get(c.id)!;
          const mints = MINERALS.filter((m) => s.mint[m]! > 0);
          return (
            <li key={c.id} className="roster-row" data-testid={`roster-${c.id}`}>
              <div className="roster-main">
                <span className="roster-swatch" style={{ background: color, color }} aria-hidden />
                <span className="roster-name">{cogName(c.index)}</span>
                <span className="roster-stats">
                  <span title="hearts">♥{c.hearts}</span>
                  <span title="energy">⚡{c.energy}</span>
                  <span title="tiles held">⬡{s.tiles}</span>
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
              <div className="roster-delta" title="projected change next upkeep">
                <span className="delta-label">this turn</span>
                {mints.length === 0 ? (
                  <span className="muted">—</span>
                ) : (
                  mints.map((m) => (
                    <span key={m} className="delta-up">
                      +{s.mint[m]!.toFixed(1)} {m}
                    </span>
                  ))
                )}
                {s.tiles > 0 && <span className="delta-down">−{s.tiles} ⚡</span>}
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
