// Autopilot control for one Cog (live mode only): an enable toggle (off =
// benched, commits nothing) and a guidance/persona textarea prepended to the
// Cog's prompt next turn. Reads the current state on mount and POSTs edits to
// the live server. When the board is scrubbed off the latest turn the panel is
// read-only: it shows the CURRENT configuration (steering history isn't
// recorded per turn) without allowing edits.
import React, { useEffect, useState } from "react";
import type { Order } from "../../shared/engine/orders";
import { cogName } from "../colors";

type Saved = "idle" | "saving" | "saved";

const orderText = (o: Order): string => {
  switch (o.type) {
    case "align":
      return `Align([${o.tile}], ${o.energy}e)`;
    case "exploit":
      return `Exploit([${o.tile}])`;
    case "abandon":
      return `Abandon([${o.tile}])`;
    case "transfer":
      return `Transfer(${o.amount} ${o.mineral} → ${cogName(Number(o.to.replace(/\D/g, "")) || 0)})`;
    case "bid":
      return `Bid(${o.energy}e)`;
  }
};

/** Operator orders queued for the NEXT Commit — each cancelable. */
function PendingActions({ pending, onCancel }: { pending: Order[]; onCancel?: (i: number) => void }): React.ReactElement {
  return (
    <div data-testid="pending-actions" style={{ marginTop: 8 }}>
      <div className="cg-label" style={{ fontSize: 8.5, letterSpacing: "0.12em", paddingBottom: 3, borderBottom: "1px solid var(--border)" }}>
        Pending Actions
      </div>
      {pending.length === 0 ? (
        <div className="cg-mono" style={{ fontSize: 9.5, color: "var(--muted)", padding: "4px 0" }}>
          none queued — right-click a tile on the lattice to add one.
        </div>
      ) : (
        pending.map((o, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
            <span className="cg-mono" style={{ fontSize: 10.5, color: "var(--text-dim)", flex: 1 }}>
              {orderText(o)}
            </span>
            {onCancel && (
              <button
                type="button"
                data-tip="cancel this queued action"
                onClick={() => onCancel(i)}
                className="cg-mono"
                style={{ background: "none", border: "none", color: "var(--exploit)", cursor: "pointer", fontSize: 11, padding: "0 2px" }}
              >
                ✕
              </button>
            )}
          </div>
        ))
      )}
      {pending.length > 0 && (
        <div className="cg-mono" style={{ fontSize: 8.5, color: "var(--muted)", paddingTop: 3 }}>
          sent at the next Commit — they override the autopilot's own orders.
        </div>
      )}
    </div>
  );
}

export function AutopilotPanel({
  cogId,
  atLatest = true,
  pending = [],
  onCancelPending,
}: {
  cogId: string;
  atLatest?: boolean;
  /** Operator orders queued for the next Commit (server-side state). */
  pending?: Order[];
  onCancelPending?: (i: number) => void;
}): React.ReactElement {
  const [persona, setPersona] = useState("");
  const [paused, setPaused] = useState(false);
  const [saved, setSaved] = useState<Saved>("idle");

  useEffect(() => {
    let live = true;
    void fetch(`/cog/${cogId}/steering`)
      .then((r) => r.json())
      .then((s: { persona: string; paused: boolean }) => {
        if (!live) return;
        setPersona(s.persona);
        setPaused(s.paused);
      });
    return () => {
      live = false;
    };
  }, [cogId]);

  const post = (patch: { persona?: string; paused?: boolean }): void => {
    setSaved("saving");
    void fetch(`/cog/${cogId}/steering`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((r) => r.json())
      .then((s: { persona: string; paused: boolean }) => {
        setPersona(s.persona);
        setPaused(s.paused);
        setSaved("saved");
      });
  };

  if (!atLatest) {
    return (
      <div className="panel steering" data-testid="autopilot">
        <h2>Autopilot</h2>
        <div className="cg-mono" style={{ fontSize: 10.5, color: paused ? "var(--exploit)" : "var(--coherence)" }}>
          {paused ? "○ disabled — benched" : "● enabled"}
        </div>
        <div className="cg-mono" style={{ fontSize: 10.5, color: "var(--text-dim)", whiteSpace: "pre-wrap", marginTop: 6 }}>
          {persona || "no guidance set"}
        </div>
        <div className="cg-mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 6 }}>
          viewing a past turn — jump to the latest to steer
        </div>
        <PendingActions pending={pending} />
      </div>
    );
  }

  return (
    <div className="panel steering" data-testid="autopilot">
      <h2>Autopilot</h2>
      <label className={`steer-toggle ${paused ? "is-paused" : ""}`}>
        <input type="checkbox" checked={!paused} onChange={(e) => post({ paused: !e.target.checked })} />
        <span>Enabled</span>
      </label>
      <textarea
        className="steer-persona"
        data-testid="steer-persona"
        value={persona}
        onChange={(e) => setPersona(e.target.value)}
        placeholder="Guidance / persona — e.g. “play aggressively and betray Bob”. Prepended to this Cog's prompt next turn."
        rows={3}
      />
      <div className="steer-actions">
        <button type="button" onClick={() => post({ persona })}>
          Send Guidance
        </button>
        <span className="steer-status">{saved === "saved" ? "✓ sent" : saved === "saving" ? "sending…" : ""}</span>
      </div>
      <PendingActions pending={pending} onCancel={onCancelPending} />
    </div>
  );
}
