// Autopilot control for one Cog (live mode only): an enable toggle (off =
// benched, the human drives the seat by hand) and a guidance/persona textarea
// prepended to the Cog's prompt next turn. The current config is read off the
// @cogweb lobby seat's bot spec; edits send ClientMessages on the live socket.
// When the board is scrubbed off the latest turn the panel is read-only: it
// shows the CURRENT configuration without allowing edits.
import React, { useEffect, useState } from "react";
import type { BotSpec, ClientMessage } from "@cogweb/protocol";
import type { Order } from "../../shared/engine/orders";
import { cogName } from "../colors";
import { TilePill } from "../cg/atoms";
import { BEDROCK_MODELS, DEFAULT_BEDROCK_MODEL } from "../../shared/models";

/** One act-prompt transcript: what this Cog's model saw and decided that turn. */
export interface ReasoningEntry {
  turn: number;
  phase: string;
  content: string;
}

/** "What the model saw & decided" — the autopilot's reasoning, newest first. */
function Reasoning({ prompts }: { prompts: ReasoningEntry[] }): React.ReactElement | null {
  const recent = [...prompts].slice(-12).reverse();
  if (recent.length === 0) return null;
  return (
    <div data-testid="reasoning" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
      <div className="cg-label" style={{ fontSize: 8.5, letterSpacing: "0.12em", paddingBottom: 3, borderBottom: "1px solid var(--border)" }}>
        What the model saw &amp; decided
      </div>
      <div className="cg-scroll" style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {recent.map((p, i) => (
          <details key={`${p.turn}-${p.phase}-${i}`} style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px" }}>
            <summary style={{ cursor: "pointer", fontSize: 10.5, color: "var(--text-dim)" }}>
              <span className="cg-mono" style={{ color: "var(--coherence)" }}>T{p.turn}</span> · {p.phase} decision
            </summary>
            <pre className="cg-mono" style={{ margin: "5px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 9, lineHeight: 1.5, color: "var(--muted)", maxHeight: 220, overflow: "auto" }}>
              {p.content}
            </pre>
          </details>
        ))}
      </div>
    </div>
  );
}

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
  energy,
  onCancel,
}: {
  pending: Order[];
  notes?: Array<string | undefined>;
  committed?: number;
  /** The cog's STORED energy — the queue must fit inside it or the engine
   *  rejects the whole set at resolve. */
  energy?: number;
  onCancel?: (i: number) => void;
}): React.ReactElement {
  const over = energy != null && committed > energy;
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
        <div
          className="cg-mono"
          data-tip={
            over
              ? "orders are billed as ONE set (incl. the repeat-align tax) — an unaffordable set is rejected WHOLESALE at resolve"
              : "total energy this queue will spend at Commit (align bills + bid + fees)"
          }
          style={{ fontSize: 9.5, color: over ? "var(--exploit)" : "var(--energy)", paddingTop: 4 }}
        >
          committed: −{committed}e
          {over && ` — exceeds your ${energy}⚡: the whole set will be REJECTED`}
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
  seat,
  bot,
  send,
  atLatest = true,
  pending = [],
  pendingNotes,
  pendingCommitted,
  onCancelPending,
  onReady,
  committed = null,
  energy,
  prompts = [],
}: {
  /** This cog's seat index (= cog index; cogId = `cog${seat}`). */
  seat: number;
  /** The @cogweb lobby seat's bot spec — the live guidance/model/autopilot state,
   *  or null when the seat carries no pilot config yet (edits then drive it). */
  bot: BotSpec | null;
  /** Send a ClientMessage on the live socket (setGuidance / setModel / setAutopilot). */
  send: (m: ClientMessage) => void;
  atLatest?: boolean;
  /** Orders the human queued (locally) for the next Commit. */
  pending?: Order[];
  /** Energy-effect note per queue index — see PendingActions. */
  pendingNotes?: Array<string | undefined>;
  /** Total energy the queue spends at Commit. */
  pendingCommitted?: number;
  onCancelPending?: (i: number) => void;
  /** Manual mode: submit the queue as this turn's decision. */
  onReady?: () => void;
  /** The orders submitted via Ready this turn — displayed frozen until Resolve. */
  committed?: { orders: Order[]; notes: Array<string | undefined>; total: number } | null;
  /** The cog's stored energy (for the over-budget warning). */
  energy?: number;
  /** This Cog's act-prompt transcripts (what the model saw & decided). */
  prompts?: ReasoningEntry[];
}): React.ReactElement {
  // The live config rides the lobby seat's bot spec; the textarea is a local
  // draft so typing doesn't fight the wire until "Send Guidance" commits it.
  const autopilot = bot?.autopilot ?? true;
  const paused = !autopilot;
  const model = bot?.model ?? DEFAULT_BEDROCK_MODEL;
  const guidance = bot?.guidance ?? "";
  const [persona, setPersona] = useState(guidance);
  const [saved, setSaved] = useState(false);
  // Reset the draft when the wire's guidance changes (a fresh seat / external edit).
  useEffect(() => {
    setPersona(guidance);
    setSaved(false);
  }, [guidance]);

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
        <PendingActions pending={pending} notes={pendingNotes} committed={pendingCommitted} energy={energy} />
        <Reasoning prompts={prompts} />
      </div>
    );
  }

  return (
    <div className="panel steering" data-testid="autopilot">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Control</h2>
        <label className={`steer-toggle ${paused ? "is-paused" : ""}`} style={{ margin: 0 }}>
          <span>Auto Pilot</span>
          <span className={`cg-switch ${!paused ? "on" : ""}`}>
            <input type="checkbox" checked={!paused} onChange={(e) => send({ type: "setAutopilot", seat, on: e.target.checked })} />
            <span className="cg-knob" />
          </span>
          <span className="steer-state">{paused ? "OFF" : "ON"}</span>
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        <span className="cg-mono" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
          Model
        </span>
        <select
          data-testid="steer-model"
          value={model}
          onChange={(e) => send({ type: "setModel", seat, model: e.target.value })}
          title="Bedrock model that drives this Cog's autopilot"
          className="cg-mono"
          style={{ flex: 1, fontSize: 10, color: "var(--text-dim)", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", cursor: "pointer" }}
        >
          {BEDROCK_MODELS.map((m) => (
            <option key={m.id} value={m.id} disabled={!m.enabled}>
              {m.label}
            </option>
          ))}
        </select>
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
            <button
              type="button"
              onClick={() => {
                send({ type: "setGuidance", seat, guidance: persona });
                setSaved(true);
              }}
            >
              Send Guidance
            </button>
            <span className="steer-status">{saved ? "✓ sent" : ""}</span>
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
          <PendingActions pending={pending} notes={pendingNotes} committed={pendingCommitted} energy={energy} onCancel={onCancelPending} />
          <div className="steer-actions" style={{ marginTop: 8 }}>
            <button type="button" data-testid="ready-btn" onClick={onReady} data-tip="submit the queued actions for this Commit and mark this cog ready (empty queue = hold)">
              Ready
            </button>
          </div>
        </>
      )}
      <Reasoning prompts={prompts} />
    </div>
  );
}
