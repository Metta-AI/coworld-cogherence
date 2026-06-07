// Live turn-timing strip (cogame-polis style): the four phases with the current
// one lit. The deadline countdown lives in the header clock; the strip carries
// just the Commit-phase ready count (how many cogs have locked their orders).
import React from "react";
import type { ServerStatus } from "../../shared/protocol";

const PHASES = ["negotiate", "commit", "resolve", "upkeep"] as const;

export function PhaseStrip({ status }: { status: ServerStatus }): React.ReactElement {
  const liveIdx = PHASES.indexOf(status.phase as (typeof PHASES)[number]);
  const ready = status.phase === "commit" && !status.finished ? `${status.done.length}/${status.cogCount} ready` : "";

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
      {ready && <span className="phase-meta">{ready}</span>}
    </div>
  );
}
