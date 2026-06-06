// Live turn-timing strip (ported from cogame-polis): the four phases with the
// current one lit, plus the Commit-phase deadline countdown and ready count.
import React, { useEffect, useState } from "react";
import type { ServerStatus } from "../../shared/protocol";

const PHASES = ["negotiate", "commit", "resolve", "upkeep"] as const;

/** Re-render on a 500ms tick while `active` so the countdown stays current. */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function PhaseStrip({ status }: { status: ServerStatus }): React.ReactElement {
  const counting = status.phaseDeadlineAt !== undefined && !status.finished;
  const now = useTick(counting);
  const secs =
    status.phaseDeadlineAt !== undefined ? Math.max(0, Math.ceil((status.phaseDeadlineAt - now) / 1000)) : null;
  const liveIdx = PHASES.indexOf(status.phase as (typeof PHASES)[number]);

  return (
    <div className="phase-strip" data-testid="phase-strip">
      <div className="phase-chips">
        {PHASES.map((p, i) => {
          const cls = status.finished || i < liveIdx ? "done" : i === liveIdx ? "live" : "";
          return (
            <span key={p} className={`phase-chip ${cls}`} title={p}>
              {p}
            </span>
          );
        })}
      </div>
      {status.phase === "commit" && !status.finished && (
        <span className="phase-meta">
          {status.done.length}/{status.cogCount} ready{secs !== null ? ` · ${secs}s` : ""}
        </span>
      )}
    </div>
  );
}
