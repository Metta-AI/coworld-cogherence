// The roster: one card per Cog, ranked by hearts — luminous sigil, name + tiles
// held, hearts (glowing), and the COGS wallet with derived energy. Each card is a
// button: clicking it spotlights that Cog's territory on the lattice (toggle).
import React from "react";
import type { GameSnapshot } from "../shared/snapshot";
import { cogColor, cogName } from "./colors";
import { CGIcon, CogSigil, Wallet } from "./cg/atoms";
import { rankedByHearts, territory } from "./cg/derive";

export function Roster({
  snapshot,
  focus = null,
  onToggleFocus,
}: {
  snapshot: GameSnapshot;
  /** The currently spotlighted cog id (its territory is highlighted on the board). */
  focus?: string | null;
  onToggleFocus?: (cogId: string) => void;
}): React.ReactElement {
  const ranked = rankedByHearts(snapshot.cogs);
  const terr = territory(snapshot);
  return (
    <div className="cg-panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }} data-testid="roster">
      <div className="cg-panel-head">
        <span className="cg-panel-title">Cogs</span>
        <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>
          {focus ? "click to clear" : "by hearts"}
        </span>
      </div>
      <div className="cg-panel-body cg-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7, padding: "10px 12px" }}>
        {ranked.map((c, i) => {
          const color = cogColor(c.index);
          const tiles = terr.get(c.id)?.tiles ?? 0;
          const active = focus === c.id;
          const dimmed = focus != null && !active;
          return (
            <button
              key={c.id}
              type="button"
              className="cg-roster-card"
              data-testid={`roster-${c.id}`}
              aria-pressed={active}
              title={`Spotlight ${cogName(c.index)}’s territory`}
              onClick={() => onToggleFocus?.(c.id)}
              style={{
                appearance: "none",
                font: "inherit",
                textAlign: "left",
                width: "100%",
                cursor: "pointer",
                padding: "9px 10px",
                borderRadius: 8,
                background: "var(--panel-2)",
                border: `1px solid ${active || i === 0 ? color : "var(--border)"}`,
                borderLeft: `3px solid ${color}`,
                boxShadow: active ? `0 0 0 1px ${color}, 0 0 16px ${color}66` : i === 0 ? `0 0 14px ${color}22` : "none",
                opacity: dimmed ? 0.5 : 1,
                transition: "opacity 0.15s, box-shadow 0.15s, border-color 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                <span className="cg-num" style={{ fontSize: 13, color: i === 0 ? color : "var(--muted)", width: 16 }}>
                  {i + 1}
                </span>
                <CogSigil index={c.index} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--f-ui)", fontWeight: 700, fontSize: 13, color: "var(--text)", letterSpacing: "0.03em" }}>
                    {cogName(c.index)}
                  </div>
                  <div className="cg-mono" style={{ fontSize: 8.5, color: "var(--muted)" }}>
                    {c.id} · {tiles} tiles
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <CGIcon name="heart" size={16} />
                  <span className="cg-num cg-glow" style={{ fontSize: 22, color: "var(--heart)", lineHeight: 1 }}>
                    {c.hearts}
                  </span>
                </div>
              </div>
              <Wallet treasury={c.treasury} energy={c.energy} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
