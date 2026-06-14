// The roster: one card per Cog, ranked by hearts — luminous sigil, name + tiles
// held, hearts (glowing), and the COGS wallet with derived energy. Each card is a
// button: clicking it spotlights that Cog's territory on the lattice (toggle).
import React, { useState } from "react";
import type { GameSnapshot } from "../shared/snapshot";
import type { StampedEvent } from "./net/feed";
import { cogColor, cogName } from "./colors";
import { CGIcon, Wallet } from "./cg/atoms";
import { expectedMintBy, mintEnergyBy, rankedByHearts, territory, upkeepBy } from "./cg/derive";

export function Roster({
  snapshot,
  events,
  focus = null,
  onToggleFocus,
  live = false,
  ready,
  waiting,
}: {
  snapshot: GameSnapshot;
  /** Event stream (for last-mint income in the energy math); omit to hide it. */
  events?: StampedEvent[];
  /** The currently spotlighted cog id (its territory is highlighted on the board). */
  focus?: string | null;
  onToggleFocus?: (cogId: string) => void;
  /** Live game: show the + control that seats a new cog. */
  live?: boolean;
  /** Cogs done with the current phase window (server status `done`). */
  ready?: string[];
  /** Cogs still deciding (server status `pending`). */
  waiting?: string[];
}): React.ReactElement {
  const ranked = rankedByHearts(snapshot.cogs);
  // right-click a card (live): the control menu — observe / take control /
  // set-autopilot / kick for that Cog.
  const [menu, setMenu] = useState<{ id: string; index: number; x: number; y: number } | null>(null);
  const goCog = (id: string): void => {
    window.location.href = `/cog/${id}?live`;
  };
  const setPaused = (id: string, paused: boolean): void => {
    void fetch(`/cog/${id}/steering`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused }) });
  };
  const terr = territory(snapshot);
  const upkeep = upkeepBy(snapshot);
  const income = events ? mintEnergyBy(events, snapshot) : null;
  const expected = expectedMintBy(snapshot);
  return (
    <div className="cg-panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }} data-testid="roster">
      <div className="cg-panel-head">
        <span className="cg-panel-title">Cogs</span>
        {live ? (
          <button
            type="button"
            className="cg-addcog"
            data-testid="add-cog"
            data-tip="Add a new cog — seats at a free corner"
            onClick={() => void fetch("/cogs/add", { method: "POST" })}
          >
            +
          </button>
        ) : (
          <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>
            by hearts
          </span>
        )}
      </div>
      <div className="cg-panel-body cg-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7, padding: "10px 12px" }}>
        {ranked.map((c, i) => {
          const color = cogColor(c.index);
          const tiles = terr.get(c.id)?.tiles ?? 0;
          const coh = terr.get(c.id)?.coherence ?? 0;
          const active = focus === c.id;
          const dimmed = focus != null && !active;
          return (
            <button
              key={c.id}
              type="button"
              className="cg-roster-card"
              data-testid={`roster-${c.id}`}
              aria-pressed={active}
              data-tip={live ? `Spotlight ${cogName(c.index)}’s territory · right-click for controls` : `Spotlight ${cogName(c.index)}’s territory`}
              onClick={() => onToggleFocus?.(c.id)}
              onContextMenu={live ? (e) => { e.preventDefault(); setMenu({ id: c.id, index: c.index, x: e.clientX, y: e.clientY }); } : undefined}
              style={{
                appearance: "none",
                font: "inherit",
                textAlign: "left",
                width: "100%",
                cursor: "pointer",
                padding: "9px 10px",
                borderRadius: 8,
                background: "var(--panel-2)",
                // longhand only: mixing `border` + `borderLeft` shorthands makes React warn on every rerender
                borderStyle: "solid",
                borderWidth: "1px 1px 1px 3px",
                borderColor: ((edge) => `${edge} ${edge} ${edge} ${color}`)(active || i === 0 ? color : "var(--border)"),
                boxShadow: active ? `0 0 0 1px ${color}, 0 0 16px ${color}66` : i === 0 ? `0 0 14px ${color}22` : "none",
                opacity: dimmed ? 0.5 : 1,
                transition: "opacity 0.15s, box-shadow 0.15s, border-color 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                <span className="cg-num" data-tip={`hearts rank #${i + 1} of ${ranked.length}`} style={{ fontSize: 13, color: i === 0 ? color : "var(--muted)", width: 16 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--f-ui)", fontWeight: 700, fontSize: 13, color: "var(--text)", letterSpacing: "0.03em" }}>
                    {cogName(c.index)}
                  </div>
                  <div className="cg-mono" style={{ fontSize: 8.5, color: "var(--muted)" }}>
                    <span data-tip="tiles currently aligned to this cog">{tiles} tiles</span>
                    <span data-tip="total coherence across its tiles — the standing order of its territory" style={{ color: "var(--coherence)" }}> · {coh} coh</span>
                  </div>
                </div>
                {ready?.includes(c.id) ? (
                  <span className="cg-mono" data-tip="locked in — done with the current phase" style={{ fontSize: 9, fontWeight: 700, color: "var(--coherence)", border: "1px solid var(--coherence)", borderRadius: 5, padding: "1px 5px" }}>
                    ✓ ready
                  </span>
                ) : waiting?.includes(c.id) ? (
                  <span className="cg-mono" data-tip="still deciding this phase" style={{ fontSize: 9, color: "var(--muted)" }}>
                    …
                  </span>
                ) : null}
                <div data-tip={`${c.hearts} hearts — most hearts at turn 100 wins`} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <CGIcon name="heart" size={16} />
                  <span className="cg-num cg-glow" style={{ fontSize: 22, color: "var(--heart)", lineHeight: 1 }}>
                    {c.hearts}
                  </span>
                </div>
              </div>
              <Wallet treasury={c.treasury} energy={c.energy} upkeep={upkeep.get(c.id) ?? 0} income={income?.get(c.id)} expected={expected.get(c.id)} />
            </button>
          );
        })}
      </div>
      {menu && (
        <div
          data-cog-menu
          className="cg-panel"
          style={{ position: "fixed", left: Math.min(menu.x, window.innerWidth - 252), top: Math.min(menu.y, window.innerHeight - 200), width: 240, zIndex: 120, background: "rgba(14,14,24,0.97)", backdropFilter: "blur(8px)" }}
        >
          <div className="cg-panel-head" style={{ padding: "7px 11px" }}>
            <span className="cg-panel-title" style={{ fontSize: 10 }}>{cogName(menu.index)}</span>
            <button type="button" onClick={() => setMenu(null)} className="cg-mono" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}>
              ✕
            </button>
          </div>
          <div className="cg-panel-body" style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              type="button"
              className="cg-menu-row"
              data-testid="observe-cog"
              data-tip="open this cog's view — its fog-of-war board, channels, and what its model saw & decided"
              onClick={() => { goCog(menu.id); setMenu(null); }}
            >
              Observe {cogName(menu.index)}
            </button>
            <button
              type="button"
              className="cg-menu-row"
              data-testid="control-cog"
              data-tip="take manual control — autopilot off; you queue orders and hit Ready in the cog view"
              onClick={() => {
                void fetch("/cogs/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: cogName(menu.index) }) });
                goCog(menu.id);
                setMenu(null);
              }}
            >
              Take control
            </button>
            <button
              type="button"
              className="cg-menu-row"
              data-testid="autopilot-cog"
              data-tip="hand this cog back to its LLM autopilot"
              onClick={() => { setPaused(menu.id, false); setMenu(null); }}
            >
              <span style={{ color: "var(--coherence)" }}>Set autopilot</span>
            </button>
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <button
              type="button"
              className="cg-menu-row"
              data-testid="kick-cog"
              data-tip="remove this cog from the game — its ground goes neutral and the seat frees up"
              onClick={() => {
                void fetch(`/cog/${menu.id}/kick`, { method: "POST" });
                setMenu(null);
              }}
            >
              <span style={{ color: "var(--exploit)" }}>Kick {cogName(menu.index)} out of the game</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
