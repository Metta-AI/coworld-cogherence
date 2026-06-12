// Observatory header: brand + view switcher (left), the four-phase strip (center),
// the turn readout + phase/game clocks + the live operator menu (right). One chrome
// shared by every view.
import React, { useEffect, useState } from "react";
import type { GameSnapshot } from "../../shared/snapshot";
import type { ServerStatus } from "../../shared/protocol";
import { MAX_TURNS } from "../../shared/engine/constants";
import { Brand, PhaseStripCG } from "../cg/atoms";
import { ViewSwitcher } from "./ViewSwitcher";
import type { View } from "./nav";

/** A 500ms ticking wall-clock so the header countdowns stay current. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return now;
}
const pad = (n: number): string => String(n).padStart(2, "0");
const mmss = (s: number): string => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
const hhmmss = (s: number): string => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

export function AppHeader({
  snapshot,
  status,
  connected,
  view,
  cogId,
  live,
  cogs,
}: {
  snapshot: GameSnapshot | null;
  status: ServerStatus | null;
  connected: boolean;
  view: View;
  cogId: string | null;
  live: boolean;
  cogs: { id: string; index: number }[];
}): React.ReactElement {
  const now = useNow();
  const paused = status?.paused ?? false;
  const phaseLeft =
    !paused && status?.phaseDeadlineAt != null && !status.finished
      ? Math.max(0, Math.ceil((status.phaseDeadlineAt - now) / 1000))
      : null;
  const elapsedAnchor = paused ? status?.pausedAt ?? now : now;
  const gameSecs =
    connected && status?.startedAt != null
      ? Math.max(0, Math.floor((elapsedAnchor - status.startedAt - (status.pausedAccumMs ?? 0)) / 1000))
      : null;

  // Phase strip is driven by the live status when connected, else the snapshot.
  const phase = connected && status && !status.finished ? status.phase : snapshot?.phase ?? "resolve";
  const ready = connected && status?.phase === "commit" && !status.finished ? `${status.done.length}/${status.cogCount} ready` : undefined;
  const turnNum = snapshot ? Math.min(snapshot.turn, status?.turnLimit ?? MAX_TURNS, MAX_TURNS) : 0;

  return (
    <header className="cg-header" data-testid="app-header">
      <div className="cg-header-left">
        <Brand />
        <span className="cg-header-rule" />
        <ViewSwitcher view={view} cogId={cogId} live={live} cogs={cogs} />
      </div>

      <div className="cg-header-center">
        <PhaseStripCG phase={phase} ready={ready} />
      </div>

      <div className="cg-header-right">
        {connected && !status?.finished && (
          <span className="cg-clock" data-tip="time left in this phase">
            <em>phase</em>
            <b className={phaseLeft === null ? "muted" : ""}>{phaseLeft === null ? "—" : mmss(phaseLeft)}</b>
          </span>
        )}
        {gameSecs !== null && (
          <span className="cg-clock" data-tip="elapsed game time">
            <em>game</em>
            <b>{hhmmss(gameSecs)}</b>
          </span>
        )}
        {snapshot && (
          <span className="cg-turn" data-testid="turn-label">
            <span className="cg-label" style={{ fontSize: 9 }}>turn</span>
            <span className="cg-num" style={{ fontSize: 34 }}>{pad(turnNum)}</span>
            <span className="cg-mono" data-tip={status?.turnLimit != null ? `auto-stops at turn ${status.turnLimit} (of ${MAX_TURNS})` : undefined} style={{ fontSize: 12, color: "var(--muted)" }}>/{status?.turnLimit ?? MAX_TURNS}</span>
          </span>
        )}
        {connected ? (
          <span className={`conn conn-live ${paused ? "is-paused" : ""}`} data-testid="live-badge">
            {paused ? "❚❚ paused" : "● live"}
          </span>
        ) : (
          <span className="cg-live cg-replay">▷ REPLAY</span>
        )}
      </div>
    </header>
  );
}
