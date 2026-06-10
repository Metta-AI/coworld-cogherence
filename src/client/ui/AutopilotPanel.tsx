// Autopilot control for one Cog (live mode only): an enable toggle (off =
// benched, commits nothing) and a guidance/persona textarea prepended to the
// Cog's prompt next turn. Reads the current state on mount and POSTs edits to
// the live server. When the board is scrubbed off the latest turn the panel is
// read-only: it shows the CURRENT configuration (steering history isn't
// recorded per turn) without allowing edits.
import React, { useEffect, useState } from "react";
import type { Order } from "../../shared/engine/orders";
import { cogName } from "../colors";
import { TilePill } from "../cg/atoms";

type Saved = "idle" | "saving" | "saved";

/** One pending order rendered with a hoverable tile pill; `note` carries its
 *  energy effect (an align's bill, an abandon's refund, an exploit's windfall). */
const orderText = (o: Order, note?: string): React.ReactNode => {
  const suffix = note ? ` · ${note}` : "";
  switch (o.type) {
    case "align":
      return (
        <>
          Align(<TilePill k={o.tile} />, force={o.force}){suffix}
        </>
      );
    case "exploit":
      return (
        <>
          Exploit(<TilePill k={o.tile} />){suffix}
        </>
      );
    case "abandon":
      return (
        <>
          Abandon(<TilePill k={o.tile} />){suffix}
        </>
      );
    case "transfer":
      return `Transfer(${o.amount} ${o.mineral} → ${cogName(Number(o.to.replace(/\D/g, "")) || 0)})`;
    case "bid":
      return `Bid(${o.energy}e)`;
  }
};

/** Operator orders queued for the NEXT Commit — each cancelable. `notes` maps
 *  queue index → the order's energy effect (computed by the owner from the
 *  board); `committed` totals the energy this queue will spend. */
function PendingActions({
  pending,
  notes,
  committed = 0,
  onCancel,
}: {
  pending: Order[];
  notes?: Array<string | undefined>;
  committed?: number;
  onCancel?: (i: number) => void;
}): React.ReactElement {
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
              {orderText(o, notes?.[i])}
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
      {committed > 0 && (
        <div className="cg-mono" data-tip="total energy this queue will spend at Commit (align bills + bid + fees)" style={{ fontSize: 9.5, color: "var(--energy)", paddingTop: 4 }}>
          committed: −{committed}e
        </div>
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
  pendingNotes,
  pendingCommitted,
  onCancelPending,
  onReady,
  committed = null,
}: {
  cogId: string;
  atLatest?: boolean;
  /** Operator orders queued for the next Commit (server-side state). */
  pending?: Order[];
  /** Energy-effect note per queue index — see PendingActions. */
  pendingNotes?: Array<string | undefined>;
  /** Total energy the queue spends at Commit. */
  pendingCommitted?: number;
  onCancelPending?: (i: number) => void;
  /** Manual mode: submit the queue for this Commit and mark the cog ready. */
  onReady?: () => void;
  /** The orders submitted via Ready this turn — displayed frozen until Resolve. */
  committed?: { orders: Order[]; notes: Array<string | undefined>; total: number } | null;
}): React.ReactElement {
  const [persona, setPersona] = useState("");
  const [paused, setPaused] = useState(false);
  const [standingBid, setStandingBid] = useState(0);
  const [saved, setSaved] = useState<Saved>("idle");

  useEffect(() => {
    let live = true;
    void fetch(`/cog/${cogId}/steering`)
      .then((r) => r.json())
      .then((s: { persona: string; paused: boolean; standingBid?: number }) => {
        if (!live) return;
        setPersona(s.persona);
        setPaused(s.paused);
        setStandingBid(s.standingBid ?? 0);
      });
    return () => {
      live = false;
    };
  }, [cogId]);

  const post = (patch: { persona?: string; paused?: boolean; standingBid?: number }): void => {
    setSaved("saving");
    void fetch(`/cog/${cogId}/steering`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((r) => r.json())
      .then((s: { persona: string; paused: boolean; standingBid?: number }) => {
        setPersona(s.persona);
        setPaused(s.paused);
        setStandingBid(s.standingBid ?? 0);
        setSaved("saved");
      });
  };

  if (!atLatest) {
    return (
      <div className="panel steering" data-testid="autopilot">
        <h2>Control</h2>
        <div className="cg-mono" style={{ fontSize: 10.5, color: paused ? "var(--exploit)" : "var(--coherence)" }}>
          {paused ? "○ manual control" : "● autopilot"}
        </div>
        <div className="cg-mono" style={{ fontSize: 10.5, color: "var(--text-dim)", whiteSpace: "pre-wrap", marginTop: 6 }}>
          {persona || "no guidance set"}
        </div>
        <div className="cg-mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 6 }}>
          viewing a past turn — jump to the latest to steer
        </div>
        <PendingActions pending={pending} notes={pendingNotes} committed={pendingCommitted} />
      </div>
    );
  }

  return (
    <div className="panel steering" data-testid="autopilot">
      <h2>Control</h2>
      <label className={`steer-toggle ${paused ? "is-paused" : ""}`}>
        <span className={`cg-switch ${!paused ? "on" : ""}`}>
          <input type="checkbox" checked={!paused} onChange={(e) => post({ paused: !e.target.checked })} />
          <span className="cg-knob" />
        </span>
        <span>Auto Pilot</span>
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span className="cg-mono" data-tip="standing heart bid — auto-bid this amount at every auction while > 0 (replaces the autopilot's own bid; 0 = let it decide)" style={{ fontSize: 10, color: "var(--muted)" }}>
          Heart bid
        </span>
        <input
          type="number"
          min={0}
          data-testid="bid-input"
          value={standingBid}
          onChange={(e) => post({ standingBid: Math.max(0, Number(e.target.value) || 0) })}
          className="cg-mono"
          style={{ width: 64, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "3px 6px", fontSize: 11 }}
        />
        <span className="cg-mono" style={{ fontSize: 10, color: "var(--muted)" }}>e</span>
      </div>
      {!paused ? (
        <>
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
        </>
      ) : committed ? (
        <>
          <PendingActions pending={committed.orders} notes={committed.notes} committed={committed.total} />
          <div className="steer-actions" style={{ marginTop: 8 }}>
            <span
              data-testid="committed-chip"
              className="cg-mono"
              data-tip="orders are locked in for this Commit — they execute at Resolve"
              style={{ fontSize: 11, fontWeight: 700, color: "var(--coherence)", border: "1px solid var(--coherence)", borderRadius: 7, padding: "4px 12px" }}
            >
              ✓ Committed
            </span>
          </div>
        </>
      ) : (
        <>
          <PendingActions pending={pending} notes={pendingNotes} committed={pendingCommitted} onCancel={onCancelPending} />
          <div className="steer-actions" style={{ marginTop: 8 }}>
            <button type="button" data-testid="ready-btn" onClick={onReady} data-tip="submit the queued actions for this Commit and mark this cog ready (empty queue = hold)">
              Ready
            </button>
          </div>
        </>
      )}
    </div>
  );
}
