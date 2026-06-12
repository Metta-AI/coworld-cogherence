// Cogherence observatory chrome: the Vickrey heart auction, the Resolve log,
// the public/DM Channels, the tile inspector, and the LatticePanel
// that wraps the luminous board with its mode toggle, legend, turn pulse, and
// inspector. All read the real GameSnapshot + event/message streams.
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { GameSnapshot } from "../../shared/snapshot";
import type { Message } from "../../shared/messages";
import type { TurnEvent } from "../../shared/engine/log";
import type { StampedEvent } from "../net/feed";
import { cogColor, cogName } from "../colors";
import { TRANSFER_FEE, upkeepBase, mintOf, exploitYield } from "../../shared/engine/constants";
import { HexBoard, type LatticeMode } from "../HexBoard";
import { CGIcon, CogText, EnergyChip, Mineral, TilePill } from "./atoms";
import { subscribeTileHighlight } from "./tile-highlight";
import {
  MINERALS,
  minClass,
  auctionAt,
  heartSpend,
  eventsAt,
  claimTilesAt,
  flipTilesAt,
  exploitTilesAt,
  lastResolvedTurn,
  tileMap,
  neighbors,
  tileStatus,
  tileDrain,
  mintEnergyBy,
} from "./derive";

const cogIdx = (id: string): number => {
  const n = Number(id.replace(/\D/g, ""));
  return Number.isNaN(n) ? 0 : n;
};

// ===== Heart auction ======================================================
export function AuctionPanel({ snapshot, events, bidder }: { snapshot: GameSnapshot; events: StampedEvent[]; bidder?: string }): React.ReactElement {
  // bidder (cog view, live): edit that cog's PERSISTENT standing bid here —
  // auto-bid this amount at every auction while > 0 (steering-backed).
  const [standingBid, setStandingBid] = useState<number | null>(null);
  useEffect(() => {
    if (!bidder) return;
    let on = true;
    void fetch(`/cog/${bidder}/steering`)
      .then((r) => r.json())
      .then((j: { standingBid?: number }) => {
        if (on) setStandingBid(j.standingBid ?? 0);
      });
    return () => {
      on = false;
    };
  }, [bidder]);
  const postBid = (v: number): void => {
    setStandingBid(v);
    void fetch(`/cog/${bidder}/steering`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ standingBid: v }) });
  };
  const turn = lastResolvedTurn(snapshot);
  const a = auctionAt(events, turn);
  const winnerIdx = a?.winner != null ? cogIdx(a.winner) : null;
  const sorted = a ? [...a.bids].sort((x, y) => y[1] - x[1]) : [];
  // Cumulative energy sunk into hearts so far (follows the scrubber), per cog.
  const spend = heartSpend(events, turn);
  const spendRows = [...spend.byCog.entries()].sort((x, y) => y[1] - x[1]);
  return (
    <div className="cg-panel" data-testid="auction-panel">
      <div className="cg-panel-head">
        <span className="cg-panel-title">Heart Auction</span>
        <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>
          Vickrey · 2nd-price
        </span>
      </div>
      <div className="cg-panel-body" style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <CGIcon name="heart" size={34} />
          {winnerIdx != null ? (
            <span style={{ width: 12, height: 12, borderRadius: 3, background: cogColor(winnerIdx) }} />
          ) : (
            <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>
              unsold
            </span>
          )}
        </div>
        <div style={{ flex: 1 }}>
          {a && a.winner ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: "var(--f-ui)", fontWeight: 700, fontSize: 15, color: cogColor(winnerIdx!) }}>
                  {cogName(winnerIdx!)}
                </span>
                <span className="cg-mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  takes the heart
                </span>
              </div>
              <div className="cg-mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                bid <b style={{ color: "var(--text)" }}>{a.top}e</b> · pays 2nd price <b style={{ color: "var(--energy)" }}>{a.price}e</b>
              </div>
            </>
          ) : (
            <div className="cg-mono" style={{ fontSize: 11, color: "var(--muted)" }}>
              {a ? "no bids cleared this turn" : "no auction yet"}
            </div>
          )}
          <div style={{ display: "flex", gap: 4, marginTop: 7, flexWrap: "wrap" }}>
            {sorted.map(([id, bid]) => {
              const won = id === a?.winner;
              return (
                <span
                  key={id}
                  data-tip={`${cogName(cogIdx(id))} bid ${bid}e${won ? " — won, pays the 2nd price" : ""}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    padding: "1px 6px",
                    borderRadius: 5,
                    background: won ? "rgba(255,77,157,0.14)" : "var(--panel-2)",
                    border: `1px solid ${won ? "var(--heart)" : "var(--border)"}`,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: cogColor(cogIdx(id)) }} />
                  <span className="cg-mono" style={{ fontSize: 10, fontWeight: 600, color: won ? "var(--heart)" : "var(--text-dim)" }}>
                    {bid}
                  </span>
                </span>
              );
            })}
          </div>
          {bidder && standingBid != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <span
                className="cg-mono"
                data-tip="standing heart bid — auto-bid this amount at every auction while > 0 (replaces the autopilot's own bid; 0 = let it decide)"
                style={{ fontSize: 10, color: "var(--muted)" }}
              >
                Heart bid
              </span>
              <input
                type="number"
                min={0}
                data-testid="bid-input"
                value={standingBid}
                onChange={(e) => postBid(Math.max(0, Number(e.target.value) || 0))}
                className="cg-mono"
                style={{ width: 64, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", padding: "3px 6px", fontSize: 11 }}
              />
              <span className="cg-mono" style={{ fontSize: 10, color: "var(--muted)" }}>e</span>
            </div>
          )}
          {spend.total > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9, paddingTop: 8, borderTop: "1px solid var(--border)" }} data-testid="heart-spend">
              <EnergyChip />
              <span className="cg-mono" style={{ fontSize: 9.5, color: "var(--muted)" }}>
                spent on hearts
              </span>
              <span className="cg-mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--energy)" }}>
                {spend.total}e
              </span>
              <span style={{ flex: 1 }} />
              {spendRows.map(([id, amt]) => (
                <span key={id} data-tip={`${cogName(cogIdx(id))} · ${amt}e on hearts`} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: cogColor(cogIdx(id)) }} />
                  <span className="cg-mono" style={{ fontSize: 10, color: "var(--text-dim)" }}>{amt}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Turn log ===========================================================
// Three information-dense sections per turn: ACTIONS (every board order a cog
// played, paired with its consequence — joined from the turn's events and the
// AFTER-board for outcomes that emit no event), AUCTION (all bids as chips,
// winner + clearing price), and UPKEEP (per-cog mint income, rotting tiles,
// and losses on one compact row each).

interface LogLine {
  cog: string;
  verb: string;
  tone: string; // cg-verb class: align / exploit / transfer / bid
  action: React.ReactNode; // tile addresses render as TilePills (hover highlights the tile)
  outcome: string;
  failed?: boolean;
}

type PlayedOrder = Extract<TurnEvent, { type: "order" }>["order"];

/** The consequence of one board order, joined from the turn's events + the after-board. */
function orderOutcome(
  cog: string,
  order: PlayedOrder,
  evs: TurnEvent[],
  rejection: string | undefined,
  map: ReturnType<typeof tileMap>,
): { outcome: string; failed: boolean } {
  if (rejection) return { outcome: `rejected, ${rejection}`, failed: true };
  switch (order.type) {
    case "align": {
      // rival aligns that exerted force on the same tile this turn (a rejected
      // set exerts none) — equal top forces repel EVERYONE, so a quiet "failed"
      // usually means a simultaneous clash the cog never saw coming.
      const rejectedCogs = new Set(evs.filter((e) => e.type === "rejected").map((e) => e.cog));
      const rivalForce = new Map<string, number>();
      for (const e of evs)
        if (e.type === "order" && e.cog !== cog && !rejectedCogs.has(e.cog) && e.order.type === "align" && e.order.tile === order.tile)
          rivalForce.set(e.cog, (rivalForce.get(e.cog) ?? 0) + e.order.force);
      const rivals = [...rivalForce.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([c, f]) => `${cogName(cogIdx(c))} force ${f}`)
        .join(", ");
      const cap = evs.find((e) => e.type === "capture" && e.tile === order.tile);
      if (cap && cap.type === "capture") {
        if (cap.to === cog)
          return {
            outcome:
              (cap.from ? `flipped ${cogName(cogIdx(cap.from))}, coh=${cap.coherence}` : `coh=${cap.coherence}`) +
              (rivals ? ` (beat ${rivals})` : ""),
            failed: false,
          };
        if (cap.to === null) return { outcome: `tie vs ${rivals || "the incumbent"} — all forces annihilated, ground neutral`, failed: true };
        return { outcome: `failed, ${cogName(cogIdx(cap.to))} took it${rivalForce.has(cap.to) ? ` with force ${rivalForce.get(cap.to)}` : ""}`, failed: true };
      }
      // no capture: the tile's alignment didn't change — reinforce or repelled
      const after = map.get(order.tile);
      if (after?.alignment === cog) return { outcome: `coh=${after.coherence}${rivals ? ` (vs ${rivals})` : ""}`, failed: false };
      return {
        outcome: after?.alignment
          ? `failed, ${cogName(cogIdx(after.alignment))} held at coh=${after.coherence}`
          : rivals
            ? `clashed with ${rivals} — tie, everyone repelled, tile stays neutral`
            : "failed, tile still neutral",
        failed: true,
      };
    }
    case "exploit": {
      const ev = evs.find((e) => e.type === "exploit" && e.cog === cog && e.tile === order.tile);
      if (ev && ev.type === "exploit") return { outcome: `+${ev.minted} ${ev.mineral}, land scarred`, failed: false };
      return { outcome: "failed, tile already gone", failed: true };
    }
    case "abandon": {
      const ev = evs.find((e) => e.type === "abandon" && e.cog === cog && e.tile === order.tile);
      if (ev && ev.type === "abandon") return { outcome: `+${ev.refund}e`, failed: false };
      return { outcome: "failed, tile already gone", failed: true };
    }
    case "transfer":
      return { outcome: `delivered, −${TRANSFER_FEE}e fee`, failed: false };
    case "bid":
      return { outcome: "", failed: false }; // bids render in the AUCTION section
  }
}

function orderLine(order: PlayedOrder, cost?: number): { verb: string; tone: string; action: React.ReactNode } {
  switch (order.type) {
    case "align":
      return { verb: "ALIGN", tone: "align", action: <>Align(<TilePill k={order.tile} />, force={order.force}){cost != null ? ` · ${cost}e` : ""}</> };
    case "exploit":
      return { verb: "EXPLOIT", tone: "exploit", action: <>Exploit(<TilePill k={order.tile} />)</> };
    case "abandon":
      return { verb: "ABANDON", tone: "transfer", action: <>Abandon(<TilePill k={order.tile} />)</> };
    case "transfer":
      return { verb: "TRANSFER", tone: "transfer", action: `Transfer(${order.amount} ${order.mineral} → ${cogName(cogIdx(order.to))})` };
    case "bid":
      return { verb: "BID", tone: "bid", action: `Bid(${order.energy}e)` };
  }
}

function Section({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px 7px", display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "2px 0 3px", borderBottom: "1px solid var(--border)", marginBottom: 3 }}>
        <span className="cg-label" style={{ fontSize: 8.5, letterSpacing: "0.12em" }}>{label}</span>
        {right != null && <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>{right}</span>}
      </div>
      {children}
    </div>
  );
}

const Quiet = ({ text }: { text: string }): React.ReactElement => (
  <div className="cg-mono" style={{ fontSize: 9.5, color: "var(--muted)", padding: "3px 0" }}>{text}</div>
);

export function TurnLog({ snapshot, events }: { snapshot: GameSnapshot; events: StampedEvent[] }): React.ReactElement {
  const turn = lastResolvedTurn(snapshot);
  const evs: TurnEvent[] = events.filter((e) => e.turn === turn).map((e) => e.event);
  const map = tileMap(snapshot);
  const rejectedBy = new Map<string, string>();
  for (const e of evs) if (e.type === "rejected") rejectedBy.set(e.cog, e.reason);

  // — ACTIONS: board orders with consequences, grouped by seat; tempo bonus last
  const actions: LogLine[] = [];
  for (const e of evs) {
    if (e.type !== "order" || e.order.type === "bid") continue;
    const { verb, tone, action } = orderLine(e.order, e.cost);
    const { outcome, failed } = orderOutcome(e.cog, e.order, evs, rejectedBy.get(e.cog), map);
    actions.push({ cog: e.cog, verb, tone, action, outcome, failed });
  }
  actions.sort((a, b) => cogIdx(a.cog) - cogIdx(b.cog));
  const tempo = evs.find((e) => e.type === "firstCommit");

  // — AUCTION: every bid order as a chip; the settle gives winner + price
  const auction = evs.find((e) => e.type === "auction");
  const bidders = evs
    .filter((e): e is Extract<TurnEvent, { type: "order" }> => e.type === "order" && e.order.type === "bid")
    .map((e) => {
      const amount = (e.order as Extract<PlayedOrder, { type: "bid" }>).energy;
      const rejected = rejectedBy.has(e.cog);
      const eligible = auction?.type === "auction" && auction.bids.some(([id]) => id === e.cog);
      const won = auction?.type === "auction" && auction.winner === e.cog;
      return { cog: e.cog, amount, won, status: won ? "won" : rejected ? "set rejected" : eligible ? "outbid" : "void — holds no ground" };
    })
    .sort((a, b) => b.amount - a.amount);

  // — PRODUCTION: one dense row per cog — mint income + net tiles gained/lost
  const upkeepRows = new Map<string, { mint: Partial<Record<string, number>>; gained: string[]; lostT: string[] }>();
  const upkeepRow = (cog: string) => {
    let r = upkeepRows.get(cog);
    if (!r) upkeepRows.set(cog, (r = { mint: {}, gained: [], lostT: [] }));
    return r;
  };
  for (const e of evs) {
    if (e.type === "mint") {
      const r = upkeepRow(e.cog);
      for (const m of MINERALS) if (e.gained[m] > 0) r.mint[m] = (r.mint[m] ?? 0) + e.gained[m];
    } else if (e.type === "capture") {
      if (e.to) upkeepRow(e.to).gained.push(`[${e.tile}]`);
      if (e.from) upkeepRow(e.from).lostT.push(`[${e.tile}]`);
    } else if (e.type === "exploit" || e.type === "abandon") upkeepRow(e.cog).lostT.push(`[${e.tile}]`);
    else if (e.type === "lost") upkeepRow(e.cog).lostT.push(`[${e.tile}]`);
  }
  const upkeepList = [...upkeepRows.entries()]
    .filter(([, r]) => Object.keys(r.mint).length > 0 || r.gained.length > 0 || r.lostT.length > 0)
    .sort((a, b) => cogIdx(a[0]) - cogIdx(b[0]));
  const mintEnergy = mintEnergyBy(events, snapshot); // what those minerals were worth in energy

  const dot = (i: number): React.ReactElement => (
    <span style={{ width: 7, height: 7, borderRadius: 2, background: cogColor(i), flex: "0 0 auto", marginTop: 4 }} />
  );

  return (
    <div className="cg-panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }} data-testid="turn-log">
      <div className="cg-panel-head">
        <span className="cg-panel-title">Turn Log</span>
        <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>
          {turn >= 1 ? `T${String(turn).padStart(2, "0")}` : "awaiting first turn"}
        </span>
      </div>
      <div className="cg-panel-body cg-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px" }}>
        {turn < 1 ? (
          <Quiet text="nothing has resolved yet." />
        ) : (
          <>
            <Section label="Actions" right={`${actions.length}`}>
            {actions.length === 0 && <Quiet text="no board orders — everyone held." />}
            {actions.map((l, i) => {
              const ai = cogIdx(l.cog);
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 7, alignItems: "start", padding: "2px 0" }}>
                  <span className={`cg-verb ${l.tone}`}>{l.verb}</span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
                    {dot(ai)}
                    <span className="cg-mono" style={{ fontSize: 10.5, color: "var(--text-dim)", lineHeight: 1.4 }}>
                      <b style={{ color: cogColor(ai) }}>{cogName(ai)}: </b>
                      {l.action}
                      <span style={{ color: l.failed ? "var(--exploit)" : "var(--coherence)" }}> =&gt; {l.outcome}</span>
                    </span>
                  </div>
                </div>
              );
            })}
            {tempo && tempo.type === "firstCommit" && (
              <div className="cg-mono" style={{ fontSize: 9.5, color: "var(--muted)", padding: "2px 0" }}>
                <b style={{ color: cogColor(cogIdx(tempo.cog)) }}>{cogName(cogIdx(tempo.cog))}</b> committed first · +{tempo.reward}⚡ · wins bid ties
              </div>
            )}
            </Section>

            <Section
              label="Auction"
              right={
                auction?.type === "auction" && auction.winner
                  ? <>♥ {cogName(cogIdx(auction.winner))} · {auction.price}e</>
                  : "unsold"
              }
            >
            {bidders.length === 0 ? (
              <Quiet
                text={
                  auction?.type === "auction" && auction.winner
                    ? "rival bids are sealed — only the winner and the clearing price are public."
                    : "no bids — the heart goes unsold."
                }
              />
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "3px 0" }}>
                {bidders.map((b) => (
                  <span
                    key={b.cog}
                    data-tip={`${cogName(cogIdx(b.cog))} bid ${b.amount}e — ${b.status}${b.won ? `, paid the 2nd price ${auction?.type === "auction" ? auction.price : 0}e` : ""}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "1px 6px",
                      borderRadius: 5,
                      background: b.won ? "rgba(255,77,157,0.14)" : "var(--panel-2)",
                      border: `1px solid ${b.won ? "var(--heart)" : "var(--border)"}`,
                      opacity: b.status.startsWith("void") || b.status === "set rejected" ? 0.55 : 1,
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: cogColor(cogIdx(b.cog)) }} />
                    <span className="cg-mono" style={{ fontSize: 10, fontWeight: 600, color: b.won ? "var(--heart)" : "var(--text-dim)" }}>
                      {b.amount}
                      {b.won ? " ✓" : b.status === "outbid" ? "" : " ∅"}
                    </span>
                  </span>
                ))}
              </div>
            )}

            </Section>

            <Section label="Production">
            {upkeepList.length === 0 && <Quiet text="quiet turn — every bill paid, nothing minted." />}
            {upkeepList.length > 0 && (
              <div
                style={{ display: "grid", gridTemplateColumns: "minmax(52px, auto) repeat(6, minmax(30px, auto)) 1fr", columnGap: 9, rowGap: 3, alignItems: "center", padding: "4px 0" }}
                data-tip="minerals minted this upkeep (floor(density × coherence / 10) per tile), their energy value, and net tiles gained/lost"
              >
                <span />
                {MINERALS.map((m) => (
                  <span key={m} className={`cg-min ${minClass(m)}`} style={{ justifySelf: "end" }}>{m}</span>
                ))}
                <span style={{ justifySelf: "end" }}><EnergyChip /></span>
                <span style={{ justifySelf: "end", display: "inline-flex" }} data-tip="net tiles gained/lost this turn">
                  <svg width={18} height={18} viewBox="0 0 18 18">
                    <path d="M9 2 L15.1 5.5 V12.5 L9 16 L2.9 12.5 V5.5 Z" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </span>
                <span />
                {upkeepList.map(([cog, r]) => {
                  const ci = cogIdx(cog);
                  return (
                    <React.Fragment key={cog}>
                      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
                        {dot(ci)}
                        <b className="cg-mono" style={{ fontSize: 10, color: cogColor(ci) }}>{cogName(ci)}</b>
                      </span>
                      {MINERALS.map((m) => (
                        <span key={m} className="cg-mono" style={{ fontSize: 10, justifySelf: "end", color: (r.mint[m] ?? 0) > 0 ? "var(--coherence)" : "var(--muted-2)" }}>
                          {(r.mint[m] ?? 0) > 0 ? `+${r.mint[m]}` : "·"}
                        </span>
                      ))}
                      <span className="cg-mono" style={{ fontSize: 10, fontWeight: 700, justifySelf: "end", color: (mintEnergy.get(cog) ?? 0) > 0 ? "var(--energy)" : "var(--muted-2)" }}>
                        {(mintEnergy.get(cog) ?? 0) > 0 ? `+${mintEnergy.get(cog)}` : "·"}
                      </span>
                      <span
                        className="cg-mono"
                        data-tip={
                          r.gained.length + r.lostT.length > 0
                            ? [r.gained.length > 0 ? `gained ${r.gained.join(" ")}` : null, r.lostT.length > 0 ? `lost ${r.lostT.join(" ")}` : null].filter(Boolean).join("\n")
                            : "no tiles changed hands"
                        }
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          justifySelf: "end",
                          color: r.gained.length - r.lostT.length > 0 ? "var(--coherence)" : r.gained.length - r.lostT.length < 0 ? "var(--exploit)" : "var(--muted-2)",
                        }}
                      >
                        {r.gained.length - r.lostT.length === 0 ? "·" : `${r.gained.length - r.lostT.length > 0 ? "+" : ""}${r.gained.length - r.lostT.length}`}
                      </span>
                      <span />
                    </React.Fragment>
                  );
                })}
              </div>
            )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ===== Channels (public + DMs) ============================================
export function ChannelMessage({ m, onSeekTurn }: { m: Message; onSeekTurn?: (turn: number) => void }): React.ReactElement {
  const fi = cogIdx(m.from);
  const isPublic = m.to === "public";
  return (
    <div
      style={{
        padding: "7px 9px",
        borderRadius: 8,
        background: isPublic ? "var(--panel-2)" : "rgba(255,193,77,0.05)",
        border: `1px solid ${isPublic ? "var(--border)" : "rgba(255,193,77,0.28)"}`,
        borderLeft: `3px solid ${cogColor(fi)}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: cogColor(fi) }} />
        <span style={{ fontFamily: "var(--f-ui)", fontWeight: 700, fontSize: 11, color: cogColor(fi) }}>{cogName(fi)}</span>
        {isPublic ? (
          <span className="cg-mono" style={{ fontSize: 8.5, color: "var(--coherence)" }}>
            PUBLIC
          </span>
        ) : (
          <span className="cg-mono" style={{ fontSize: 8.5, color: "var(--deal)" }}>
            🔒 → {cogName(cogIdx(m.to))}
          </span>
        )}
        <button onClick={() => onSeekTurn?.(m.turn)} className="cg-mono cg-turnjump" style={{ marginLeft: "auto", fontSize: 8.5 }}>
          T{String(m.turn).padStart(2, "0")}
        </button>
      </div>
      <div className="cg-mono" style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
        <CogText text={m.text} />
      </div>
    </div>
  );
}

export function Channels({ messages, onSeekTurn }: { messages: Message[]; onSeekTurn?: (turn: number) => void }): React.ReactElement {
  const [tab, setTab] = useState<"all" | "public" | "dm">("all");
  let msgs = messages;
  if (tab === "public") msgs = msgs.filter((m) => m.to === "public");
  if (tab === "dm") msgs = msgs.filter((m) => m.to !== "public");
  msgs = msgs.slice(-40).reverse();
  return (
    <div className="cg-panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }} data-testid="channels">
      <div className="cg-panel-head">
        <span className="cg-panel-title">Channels</span>
        <div className="cg-seg">
          {([["all", "All"], ["public", "Public"], ["dm", "DMs"]] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="cg-panel-body cg-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7, padding: "10px 12px" }}>
        {msgs.length === 0 && (
          <div className="cg-mono" style={{ fontSize: 11, color: "var(--muted)" }}>
            silence on the wire.
          </div>
        )}
        {msgs.map((m) => (
          <ChannelMessage key={m.seq} m={m} onSeekTurn={onSeekTurn} />
        ))}
      </div>
    </div>
  );
}

// ===== Tile inspector (hover card — follows the cursor, nothing pinned) ===
export function TileInspector({ tileKey: key, snapshot }: { tileKey: string; snapshot: GameSnapshot }): React.ReactElement | null {
  const map = tileMap(snapshot);
  const t = map.get(key);
  if (!t) return null;
  const ownerIdx = t.alignment != null ? cogIdx(t.alignment) : null;
  const ownerColor = ownerIdx != null ? cogColor(ownerIdx) : "var(--muted)";
  const nb = neighbors(t.q, t.r, map);
  const friendly = t.alignment ? nb.filter((n) => n.alignment === t.alignment).length : 0;
  const nc = nb.length;
  const status = tileStatus(t, map, snapshot.coherenceMax, ownerColor);
  const drain = tileDrain(t, snapshot);
  // The bill is just the empire-scaled base — resistance costs no energy.
  // Neighbors move COHERENCE instead: +1 per ally (paid bills only) − 1 per foe.
  const enemies = t.alignment ? nb.filter((n) => n.alignment !== null && n.alignment !== t.alignment).length : 0;
  const ownedCount = t.alignment ? snapshot.tiles.filter((x) => x.alignment === t.alignment).length : 0;
  const base = upkeepBase(ownedCount);
  const scarred = t.density < t.density0; // an exploit ground the deposit down
  const mint = mintOf(t.density, t.coherence); // mineral/turn (deterministic)
  const row = (label: string, value: React.ReactNode): React.ReactElement => (
    <tr key={label}>
      <td className="cg-label" style={{ fontSize: 9, padding: "3px 0" }}>{label}</td>
      <td className="cg-mono" style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "right", padding: "3px 0" }}>{value}</td>
    </tr>
  );
  return (
    <div className="cg-panel" style={{ width: 248, background: "rgba(14,14,24,0.94)", backdropFilter: "blur(8px)" }} data-testid="tile-inspector">
      <div className="cg-panel-head" style={{ padding: "8px 11px" }}>
        <span className="cg-panel-title" style={{ fontSize: 11 }}>
          Tile {key}
        </span>
        <Mineral m={t.mineral} />
      </div>
      <div className="cg-panel-body" style={{ padding: 11, display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 13, height: 13, borderRadius: 4, border: "1px solid var(--border)", background: ownerIdx != null ? ownerColor : "var(--panel-2)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-ui)", fontWeight: 700, fontSize: 12, color: ownerColor }}>
              {ownerIdx != null ? cogName(ownerIdx) : "Unaligned"}
            </div>
            <div className="cg-mono" style={{ fontSize: 9, fontWeight: 700, color: status.tone, letterSpacing: "0.06em" }}>
              {status.label}
            </div>
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {row("coherence", <span style={{ color: "var(--coherence)" }}>{t.coherence}/{snapshot.coherenceMax}</span>)}
            {row(
              "density",
              scarred ? (
                <span data-tip={`exploited — deposit ground down from ${Math.floor(t.density0)}`}>
                  <s style={{ color: "var(--muted-2)" }}>{Math.floor(t.density0)}</s>
                  <span style={{ color: "var(--exploit)" }}> {Math.floor(t.density)}</span>
                  <span style={{ color: "var(--muted)" }}>/10</span>
                </span>
              ) : (
                <span data-tip="deposit richness (0-10) — mints floor(density × coherence / 10) per turn">
                  {Math.floor(t.density)}<span style={{ color: "var(--muted)" }}>/10</span>
                </span>
              ),
            )}
            {row(
              "mining",
              mint > 0 ? (
                <span data-tip={`floor(density × coherence / 10) ${t.mineral} minted every upkeep`}>
                  <b style={{ color: "var(--text-dim)" }}>+{mint}</b> {t.mineral}/turn
                </span>
              ) : (
                <span data-tip="mints floor(density × coherence / 10) per turn — needs both density and coherence" style={{ color: "var(--muted)" }}>—</span>
              ),
            )}
            {row(
              "exploit",
              exploitYield(t.coherence, t.density) > 0 ? (
                <span data-tip={`one-time Exploit windfall: floor(10 × coherence × density) ${t.mineral} — wipes coherence and scars the deposit`} style={{ color: "var(--exploit)" }}>
                  +{exploitYield(t.coherence, t.density)} {t.mineral}
                </span>
              ) : (
                <span data-tip="Exploit yields floor(10 × coherence × density) — worthless without both" style={{ color: "var(--muted)" }}>—</span>
              ),
            )}
            {row(
              "upkeep",
              drain ? (
                drain.paid ? (
                  <span data-tip={`base bill = floor(√${ownedCount} tiles) — empire scale taxes every tile; resistance costs no energy`} style={{ color: "var(--exploit)" }}>
                    −{drain.drain}e/turn
                  </span>
                ) : (
                  <span data-tip="the owner's wallet doesn't reach this tile — an unpaid tile gets NO ally healing (enemy drain still applies)" style={{ color: "var(--exploit)" }}>
                    unpaid
                  </span>
                )
              ) : (
                "—"
              ),
            )}
            {drain &&
              (drain.steps ?? 0) > 0 &&
              row(
                "pressure",
                drain.verdict === "grows" ? (
                  <span data-tip={`+1 coherence per allied neighbor − 1 per foe (${friendly} allies, ${enemies} foes) — free, every upkeep`} style={{ color: "var(--coherence)" }}>
                    +{drain.steps} coh/turn
                  </span>
                ) : (
                  <span
                    data-tip={`−1 coherence per enemy neighbor + 1 per ally (${friendly} allies, ${enemies} foes)${drain.paid ? "" : " — ally healing needs a paid bill"} — at 0 the tile goes neutral`}
                    style={{ color: "var(--exploit)" }}
                  >
                    −{drain.steps} coh/turn
                  </span>
                ),
              )}
            {row(
              "neighbors",
              t.alignment
                ? `${friendly} ally · ${enemies} foe · ${nc - friendly - enemies} open`
                : `${nb.filter((n) => n.alignment != null).length} claimed · ${nb.filter((n) => n.alignment == null).length} open`,
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Board overlays =====================================================
function ModeToggle({ mode, setMode }: { mode: LatticeMode; setMode: (m: LatticeMode) => void }): React.ReactElement {
  return (
    <div className="cg-seg cg-glass">
      {([["coherence", "Coherence"], ["mineral", "Minerals"], ["ownership", "Territory"]] as const).map(([k, l]) => (
        <button key={k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function LatticeLegend({ mode }: { mode: LatticeMode }): React.ReactElement {
  if (mode === "mineral")
    return (
      <div className="cg-glass" style={{ display: "flex", gap: 10, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)" }}>
        {MINERALS.map((m) => (
          <Mineral key={m} m={m} label />
        ))}
      </div>
    );
  return (
    <div className="cg-glass" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)" }}>
      <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>
        {mode === "ownership" ? "territory · digit = coherence" : "glow = coherence"}
      </span>
      {mode === "coherence" && (
        <div style={{ display: "flex", gap: 2 }}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <span key={n} style={{ width: 8, height: 12, borderRadius: 1, background: "#3ce0c0", opacity: 0.12 + (n / 6) * 0.85 }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Which turn-pulse stat is being hovered — highlights its tiles on the board. */
export type PulseGroup = "claimed" | "flipped" | "exploited";

function TurnPulse({
  snapshot,
  events,
  onHoverGroup,
}: {
  snapshot: GameSnapshot;
  events: StampedEvent[];
  onHoverGroup?: (g: PulseGroup | null) => void;
}): React.ReactElement | null {
  const turn = lastResolvedTurn(snapshot);
  const evs = eventsAt(events, turn);
  if (turn < 1) return null;
  const claims = evs.filter((e) => e.type === "capture" && e.from === null).length;
  const flips = evs.filter((e) => e.type === "capture" && e.from !== null).length;
  const exps = evs.filter((e) => e.type === "exploit").length;
  const auc = evs.find((e) => e.type === "auction");
  const winnerIdx = auc && auc.type === "auction" && auc.winner ? cogIdx(auc.winner) : null;
  const hover = (g: PulseGroup) => ({
    onMouseEnter: () => onHoverGroup?.(g),
    onMouseLeave: () => onHoverGroup?.(null),
    style: { cursor: "default" } as const,
  });
  return (
    <div className="cg-glass" style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
      <span className="cg-mono" {...hover("claimed")} style={{ fontSize: 10, color: "var(--align)" }}>
        {claims} claimed
      </span>
      <span className="cg-mono" {...hover("flipped")} style={{ fontSize: 10, color: "var(--text-dim)" }}>
        {flips} flipped
      </span>
      {exps > 0 && (
        <span className="cg-mono" {...hover("exploited")} style={{ fontSize: 10, color: "var(--exploit)" }}>
          ✺ {exps} exploited
        </span>
      )}
      {winnerIdx != null && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <CGIcon name="heart" size={12} />
          <span className="cg-mono" style={{ fontSize: 10, color: "var(--heart)" }}>
            {cogName(winnerIdx)}
          </span>
        </span>
      )}
    </div>
  );
}

// ===== Lattice panel (the framed, instrumented board) =====================
export function LatticePanel({
  snapshot,
  events,
  mode,
  setMode,
  highlight = null,
  onTileContextMenu,
  planned,
}: {
  snapshot: GameSnapshot;
  events: StampedEvent[];
  mode: LatticeMode;
  setMode: (m: LatticeMode) => void;
  highlight?: string | null;
  /** Operator tile right-click (cog view: opens the queue-order context menu). */
  onTileContextMenu?: (key: string, at: { x: number; y: number }) => void;
  /** Planned/committed aligns to outline on the board (see HexBoard). */
  planned?: Array<{ tile: string; coh: number; color: string }>;
}): React.ReactElement {
  // The inspector is a hover card: it tracks the tile under the cursor and sits
  // just beside it, flipping at the panel's right/bottom edges. Leaving the
  // lattice dismisses it — nothing is pinned.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const CARD_W = 248;
  const CARD_H = 312;
  const OFF = 18;
  const handleHover = useCallback((key: string | null, at?: { x: number; y: number }) => {
    if (!key || !at) {
      setHover(null);
      return;
    }
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = at.x - r.left;
    const py = at.y - r.top;
    const x = px + OFF + CARD_W > r.width ? Math.max(8, px - OFF - CARD_W) : px + OFF;
    const y = py + OFF + CARD_H > r.height ? Math.max(8, py - OFF - CARD_H) : py + OFF;
    setHover({ key, x, y });
  }, []);
  const turn = lastResolvedTurn(snapshot);
  const flips = flipTilesAt(events, turn);
  const exploited = exploitTilesAt(events, turn);
  // Hovering a turn-pulse stat rings the tiles it mentions.
  const [pulse, setPulse] = useState<PulseGroup | null>(null);
  const [hotTiles, setHotTiles] = useState<string[]>([]);
  useEffect(() => subscribeTileHighlight(setHotTiles), []);
  const emphasis = [
    ...(pulse === "claimed" ? claimTilesAt(events, turn) : pulse === "flipped" ? flips : pulse === "exploited" ? exploited : []),
    ...hotTiles,
  ];
  return (
    <div className="cg-panel cg-lattice" ref={wrapRef} data-testid="lattice">
      <div style={{ position: "absolute", inset: 0, padding: 8 }}>
        <HexBoard
          snapshot={snapshot}
          mode={mode}
          onHoverTile={handleHover}
          flips={flips}
          exploited={exploited}
          emphasis={emphasis}
          highlight={highlight}
          planned={planned}
        onTileContextMenu={onTileContextMenu}
          />
      </div>
      <div style={{ position: "absolute", top: 12, left: 14 }}>
        <TurnPulse snapshot={snapshot} events={events} onHoverGroup={setPulse} />
      </div>
      <div style={{ position: "absolute", top: 12, right: 14 }}>
        <ModeToggle mode={mode} setMode={setMode} />
      </div>
      <div style={{ position: "absolute", bottom: 12, right: 14 }}>
        <LatticeLegend mode={mode} />
      </div>
      <div className="cg-glass" style={{ position: "absolute", bottom: 12, left: 14, padding: "5px 9px", borderRadius: 8, border: "1px solid var(--border)", opacity: 0.75 }}>
        <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>
          scroll zoom · drag pan · 2×click reset{onTileContextMenu ? " · right-click queue order" : ""}
        </span>
      </div>
      {hover && (
        <div style={{ position: "absolute", left: hover.x, top: hover.y, pointerEvents: "none", zIndex: 5 }}>
          <TileInspector tileKey={hover.key} snapshot={snapshot} />
        </div>
      )}
    </div>
  );
}
