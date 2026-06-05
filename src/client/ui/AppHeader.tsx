// Top bar: brand + the turn / commons / phase readout + the live/replay badge.
import React from "react";
import type { GameSnapshot } from "../../shared/snapshot";
import type { ServerStatus } from "../../shared/protocol";

export function AppHeader({
  snapshot,
  status,
  connected,
}: {
  snapshot: GameSnapshot | null;
  status: ServerStatus | null;
  connected: boolean;
}): React.ReactElement {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">⬡</span>
        <span className="brand-name">Cogherence</span>
      </div>
      <div className="header-stats">
        {snapshot && (
          <>
            <span className="stat" data-testid="turn-label">
              <em>turn</em> {snapshot.turn}
            </span>
            <span className="stat">
              <em>commons</em> {snapshot.commons}
            </span>
          </>
        )}
        {status && (
          <span className={`stat phase phase-${status.phase}`}>{status.finished ? "finished" : status.phase}</span>
        )}
        <span className={`conn ${connected ? "conn-live" : "conn-replay"}`}>{connected ? "● live" : "▷ replay"}</span>
      </div>
    </header>
  );
}
