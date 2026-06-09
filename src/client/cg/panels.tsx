// Cogherence observatory chrome: the Vickrey heart auction, the Resolve log,
// the public/DM Channels, the tile inspector, and the LatticePanel
// that wraps the luminous board with its mode toggle, legend, turn pulse, and
// inspector. All read the real GameSnapshot + event/message streams.
import React, { useCallback, useRef, useState } from "react";
import type { GameSnapshot } from "../../shared/snapshot";
import type { Message } from "../../shared/messages";
import type { TurnEvent } from "../../shared/engine/log";
import type { StampedEvent } from "../net/feed";
import { cogColor, cogName } from "../colors";
import { TRANSFER_FEE, upkeepPerTile } from "../../shared/engine/constants";
import { HexBoard, type LatticeMode } from "../HexBoard";
import { CGIcon, CogSigil, CogText, Mineral } from "./atoms";
import {
  MINERALS,
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
} from "./derive";

const cogIdx = (id: string): number => {
  const n = Number(id.replace(/\D/g, ""));
  return Number.isNaN(n) ? 0 : n;
};

// ===== Heart auction ======================================================
export function AuctionPanel({ snapshot, events }: { snapshot: GameSnapshot; events: StampedEvent[] }): React.ReactElement {
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
            <CogSigil index={winnerIdx} size={26} />
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
          {spend.total > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9, paddingTop: 8, borderTop: "1px solid var(--border)" }} data-testid="heart-spend">
              <CGIcon name="energy" size={13} />
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

// ===== Resolve log ========================================================
const EVENT_ORDER: Record<string, number> = { exploit: 0, capture: 1, lost: 2, transfer: 3, auction: 4, starved: 5, firstCommit: 6, rejected: 7 };

function EventTag({ e }: { e: TurnEvent }): React.ReactElement {
  if (e.type === "capture") return <span className={`cg-verb ${e.from ? "exploit" : "align"}`}>{e.from ? "FLIP" : "ALIGN"}</span>;
  if (e.type === "exploit") return <span className="cg-verb exploit">EXPLOIT</span>;
  if (e.type === "transfer") return <span className="cg-verb transfer">TRANSFER</span>;
  if (e.type === "lost") return <span className="cg-verb exploit">LOST</span>;
  if (e.type === "auction") return <span className="cg-verb bid">AUCTION</span>;
  return (
    <span className="cg-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "var(--muted)", padding: "2px 6px", background: "var(--panel-2)", borderRadius: 5 }}>
      {e.type === "starved" ? "STARVE" : e.type.toUpperCase()}
    </span>
  );
}

function actorOf(e: TurnEvent): string | null {
  switch (e.type) {
    case "capture":
      return e.to;
    case "exploit":
    case "lost":
    case "starved":
    case "firstCommit":
    case "rejected":
      return e.cog;
    case "transfer":
      return e.from;
    case "auction":
      return e.winner;
    default:
      return null;
  }
}

function eventText(e: TurnEvent): React.ReactNode {
  switch (e.type) {
    case "capture": {
      const cost = e.to && e.spent > 0 ? ` · −${e.spent}e` : "";
      return e.from
        ? `flipped ${e.tile} from ${cogName(cogIdx(e.from))} → coherence ${e.coherence}${cost}`
        : `claimed ${e.tile} → coherence ${e.coherence}${cost}`;
    }
    case "exploit":
      return `strip-mined ${e.tile} → +${e.minted} ${e.mineral}, land scarred`;
    case "transfer":
      return `${e.amount} ${e.mineral} → ${cogName(cogIdx(e.to))} · −${TRANSFER_FEE}e fee`;
    case "auction":
      return e.winner ? `wins the heart, pays 2nd-price ${e.price}e` : "heart unsold";
    case "lost":
      return `lost ${e.tile} — ${e.cause === "rot" ? "rotted to neutral" : "starved out"}`;
    case "starved":
      return `${e.tile} starved → coherence ${e.coherence}`;
    case "firstCommit":
      return `committed first · +${e.reward}⚡`;
    case "rejected":
      return `order rejected — ${e.reason}`;
    default:
      return e.type;
  }
}

export function ResolveLog({ snapshot, events }: { snapshot: GameSnapshot; events: StampedEvent[] }): React.ReactElement {
  const turn = lastResolvedTurn(snapshot);
  // Starve rows are upkeep noise at scale — the board shows rot directly.
  const evs = eventsAt(events, turn)
    .filter((e) => e.type !== "starved")
    .sort((a, b) => (EVENT_ORDER[a.type] ?? 9) - (EVENT_ORDER[b.type] ?? 9));
  return (
    <div className="cg-panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }} data-testid="resolve-log">
      <div className="cg-panel-head">
        <span className="cg-panel-title">Resolve Log</span>
        <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>
          {turn >= 1 ? `T${String(turn).padStart(2, "0")} · ${evs.length}` : "awaiting first turn"}
        </span>
      </div>
      <div className="cg-panel-body cg-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5, padding: "8px 12px" }}>
        {evs.length === 0 && (
          <div className="cg-mono" style={{ fontSize: 10, color: "var(--muted)" }}>
            nothing has resolved yet.
          </div>
        )}
        {evs.map((e, i) => {
          const actor = actorOf(e);
          const ai = actor != null ? cogIdx(actor) : null;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "74px 1fr", gap: 8, alignItems: "start", padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <EventTag e={e} />
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                {ai != null && <span style={{ width: 7, height: 7, borderRadius: 2, background: cogColor(ai), flex: "0 0 auto", marginTop: 4 }} />}
                <span className="cg-mono" style={{ fontSize: 10.5, color: e.type === "exploit" ? "var(--exploit)" : "var(--text-dim)", lineHeight: 1.4 }}>
                  {ai != null && <b style={{ color: cogColor(ai) }}>{cogName(ai)} </b>}
                  {eventText(e)}
                </span>
              </div>
            </div>
          );
        })}
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
        <CogSigil index={fi} size={18} glow={false} />
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
  const willGain = friendly >= Math.floor(nc / 2) + 1;
  const ownerTiles = t.alignment ? snapshot.tiles.filter((x) => x.alignment === t.alignment).length : 0;
  const rate = t.alignment ? upkeepPerTile(ownerTiles) : 0;
  const scarred = t.density < t.density0; // an exploit halved the deposit
  const mint = (t.density * t.coherence) / 10; // expected mineral/turn
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
      </div>
      <div className="cg-panel-body" style={{ padding: 11, display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {ownerIdx != null ? (
            <CogSigil index={ownerIdx} size={26} />
          ) : (
            <div style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)" }} />
          )}
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
            {row(
              "coherence",
              <span>
                <span style={{ color: "var(--coherence)" }}>{t.coherence}/{snapshot.coherenceMax}</span>
                {t.alignment && willGain && t.coherence < snapshot.coherenceMax && (
                  <span data-tip="gains +1 coherence at Upkeep (drains 1e)" style={{ color: "var(--align)" }}> (+1)</span>
                )}
                {t.alignment && !willGain && t.coherence > 0 && (
                  <span data-tip="rots −1 coherence at Upkeep (minority-friendly neighborhood)" style={{ color: "var(--exploit)" }}> (−1)</span>
                )}
              </span>,
            )}
            {row(
              "mining",
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                {mint > 0 && <b style={{ color: "var(--text-dim)" }}>+{mint.toFixed(1)}</b>}
                <Mineral m={t.mineral} />
                {scarred ? (
                  <span data-tip={`exploited — deposit halved from ${t.density0}`}>
                    <s style={{ color: "var(--muted-2)" }}>{t.density0}</s>
                    <span style={{ color: "var(--exploit)" }}> {t.density}</span>
                  </span>
                ) : (
                  <span data-tip="deposit density — mints density × coherence / 10 per turn">{t.density}</span>
                )}
              </span>,
            )}
            {row(
              "energy",
              t.alignment ? (
                <span style={{ color: "var(--exploit)" }}>
                  −{rate}e/turn{willGain && t.coherence < snapshot.coherenceMax ? " − 1e gain" : ""}
                </span>
              ) : (
                "—"
              ),
            )}
            {row("neighbors", `${friendly}/${nc} friendly`)}
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
}: {
  snapshot: GameSnapshot;
  events: StampedEvent[];
  mode: LatticeMode;
  setMode: (m: LatticeMode) => void;
  highlight?: string | null;
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
  const emphasis = pulse === "claimed" ? claimTilesAt(events, turn) : pulse === "flipped" ? flips : pulse === "exploited" ? exploited : [];
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
          scroll zoom · drag pan · 2×click reset
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
