// Broadcast console header (polis layout): brand + view-switcher dropdown on the
// left, the phase strip centered, and the turn readout + phase/game clocks +
// reset + live badge on the right. One chrome shared by every view.
import React, { useEffect, useState } from "react";
import type { GameSnapshot } from "../../shared/snapshot";
import type { ServerStatus } from "../../shared/protocol";
import { PhaseStrip } from "./PhaseStrip";
import { ViewSwitcher } from "./ViewSwitcher";
import { LiveMenu } from "./LiveMenu";
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
  // Paused → the phase countdown shows "—" and the GAME clock freezes (anchored at
  // the pause epoch), excluding all paused time so it resumes where it left off.
  const phaseLeft =
    !paused && status?.phaseDeadlineAt != null && !status.finished
      ? Math.max(0, Math.ceil((status.phaseDeadlineAt - now) / 1000))
      : null;
  const elapsedAnchor = paused ? status?.pausedAt ?? now : now;
  const gameSecs =
    connected && status?.startedAt != null
      ? Math.max(0, Math.floor((elapsedAnchor - status.startedAt - (status.pausedAccumMs ?? 0)) / 1000))
      : null;

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="brand">
          <span className="brand-mark">⬡</span>
          <span className="brand-name">Cogherence</span>
        </div>
        <ViewSwitcher view={view} cogId={cogId} live={live} cogs={cogs} />
      </div>

      <div className="header-center">{status && connected && !status.finished && <PhaseStrip status={status} />}</div>

      <div className="header-stats">
        {snapshot && (
          <span className="hero-turn" data-testid="turn-label">
            <em>turn</em>
            <b>{snapshot.turn}</b>
          </span>
        )}
        {!connected && status && (
          <span className="stat phase">{status.finished ? "finished" : status.phase}</span>
        )}
        {connected && !status?.finished && (
          <span className="clock" title="time left in this phase">
            <em>phase</em>
            <b className={phaseLeft === null ? "muted" : ""}>{phaseLeft === null ? "—" : mmss(phaseLeft)}</b>
          </span>
        )}
        {gameSecs !== null && (
          <span className="clock" title="elapsed game time">
            <em>game</em>
            <b>{hhmmss(gameSecs)}</b>
          </span>
        )}
        {connected ? (
          <LiveMenu paused={status?.paused ?? false} />
        ) : (
          <span className="conn conn-replay">▷ replay</span>
        )}
      </div>
    </header>
  );
}
