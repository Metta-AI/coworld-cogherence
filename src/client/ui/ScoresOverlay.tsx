// End-of-game scoreboard (live mode): the final ranking by hearts with the
// winner crowned, a "New game" button (resets the live server, keeping the
// roster), and a close (✕) so the operator can scrub the finished timeline and
// reopen it from the FINAL chip. Mirrors agricogla's ScoreBoard / "Play again".
import React from "react";
import type { GameSnapshot } from "../../shared/snapshot";
import { cogColor, cogName } from "../colors";
import { CGIcon } from "../cg/atoms";
import { rankedByHearts, territory } from "../cg/derive";

export function ScoresOverlay({
  snapshot,
  onNewGame,
  onClose,
}: {
  snapshot: GameSnapshot;
  onNewGame: () => void;
  onClose: () => void;
}): React.ReactElement {
  const ranked = rankedByHearts(snapshot.cogs);
  const terr = territory(snapshot);
  const top = ranked[0];
  const winners = ranked.filter((c) => c.hearts === (top?.hearts ?? 0));
  const tie = winners.length > 1;
  const winnerText = top
    ? `${winners.map((w) => cogName(w.index)).join(" & ")} ${tie ? "tie" : "wins"} with ${top.hearts} ${top.hearts === 1 ? "heart" : "hearts"}.`
    : "No cogs on the board.";

  return (
    <div
      data-testid="scores-overlay"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(6,6,14,0.84)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div onClick={(e) => e.stopPropagation()} className="cg-panel" style={{ width: 520, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", padding: 0 }}>
        <div className="cg-panel-head" style={{ padding: "12px 16px" }}>
          <span className="cg-panel-title" style={{ fontSize: 15 }}>Final standings</span>
          <button type="button" data-testid="scores-close" onClick={onClose} className="cg-mono" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}>
            ✕
          </button>
        </div>
        <div className="cg-panel-body" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="cg-mono" style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)" }}>{winnerText}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ranked.map((c, i) => {
              const color = cogColor(c.index);
              const win = c.hearts === (top?.hearts ?? 0) && c.hearts > 0;
              return (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 11px",
                    borderRadius: 8,
                    background: "var(--panel-2)",
                    borderLeft: `3px solid ${color}`,
                    boxShadow: win ? `0 0 14px ${color}44` : "none",
                  }}
                >
                  <span className="cg-num" style={{ width: 18, fontSize: 13, color: i === 0 ? color : "var(--muted)" }}>{i + 1}</span>
                  <span style={{ flex: 1, fontFamily: "var(--f-ui)", fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
                    {cogName(c.index)} {win ? "👑" : ""}
                  </span>
                  <span className="cg-mono" style={{ fontSize: 10, color: "var(--muted)" }}>{terr.get(c.id)?.tiles ?? 0} tiles</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <CGIcon name="heart" size={15} />
                    <span className="cg-num cg-glow" style={{ fontSize: 20, color: "var(--heart)", lineHeight: 1 }}>{c.hearts}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            data-testid="play-again"
            onClick={onNewGame}
            className="cg-btn-primary"
            style={{ alignSelf: "center", marginTop: 4, padding: "9px 24px", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", borderRadius: 8, border: "1px solid var(--heart)", background: "var(--heart)", color: "#1a0a12" }}
          >
            ↻ New game
          </button>
        </div>
      </div>
    </div>
  );
}
