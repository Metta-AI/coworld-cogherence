// End-of-game standings, shown on the synthetic FINAL turn — the score the scrubber
// lands on once the game is over. The panel chrome (heading, headline, New game) is
// the shared @cogweb/ui FinalScorePanel; this supplies only the hearts-ranking body.
// It is NOT a modal: it fills the view region while the scrubber stays live, so the
// operator scrubs one tick back to the final board and forward to the standings.
import React from "react";
import { FinalScorePanel } from "@cogweb/ui";
import type { GameSnapshot } from "../../shared/snapshot";
import { cogColor, cogName } from "../colors";
import { CGIcon } from "../cg/atoms";
import { rankedByHearts, territory } from "../cg/derive";

export function FinalScores({
  snapshot,
  onNewGame,
}: {
  snapshot: GameSnapshot;
  onNewGame: () => void;
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
    <FinalScorePanel title="Final standings" summary={winnerText} onPlayAgain={onNewGame} playAgainLabel="↻ New game">
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
    </FinalScorePanel>
  );
}
