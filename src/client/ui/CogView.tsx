// A single Cog's HUD: its identity (treasury → derived energy, territory shape),
// its last committed resolution, what its model saw + decided, and the channels
// it can read — beside the public lattice with its own territory in focus.
import React, { useState } from "react";
import type { GameSnapshot } from "../../shared/snapshot";
import type { Message } from "../../shared/messages";
import type { StampedEvent } from "../net/feed";
import type { LatticeMode } from "../HexBoard";
import { cogColor, cogName } from "../colors";
import { CGIcon, CogSigil, Mineral } from "../cg/atoms";
import { LatticePanel, ChannelMessage } from "../cg/panels";
import { ResizableColumns } from "../cg/ResizableColumns";
import {
  MINERALS,
  MINERAL_NAME,
  setsOf,
  territory,
  rankedByHearts,
  auctionAt,
  eventsAt,
  lastResolvedTurn,
} from "../cg/derive";
import { PromptsPanel } from "../PromptsPanel";
import { SteeringPanel } from "./SteeringPanel";
import type { ActPromptFrame } from "../net/feed";

const cogIdx = (id: string): number => Number(id.replace(/\D/g, "")) || 0;

function Identity({ snapshot, cogId }: { snapshot: GameSnapshot; cogId: string }): React.ReactElement | null {
  const me = snapshot.cogs.find((c) => c.id === cogId);
  if (!me) return null;
  const color = cogColor(me.index);
  const terr = territory(snapshot).get(cogId) ?? { tiles: 0, fortresses: 0, salients: 0 };
  const rank = rankedByHearts(snapshot.cogs).findIndex((c) => c.id === cogId) + 1;
  const sets = setsOf(me.treasury);
  return (
    <div className="cg-panel" style={{ borderTop: `3px solid ${color}` }} data-testid="identity">
      <div className="cg-panel-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CogSigil index={me.index} size={52} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-ui)", fontWeight: 700, fontSize: 22, color: "var(--text)", letterSpacing: "0.03em" }}>{cogName(me.index)}</div>
            <div className="cg-mono" style={{ fontSize: 10, color: "var(--muted)" }}>
              {cogId} · rank {rank}/{snapshot.cogs.length}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <CGIcon name="heart" size={18} />
              <span className="cg-num cg-glow" style={{ fontSize: 30, color: "var(--heart)", lineHeight: 1 }}>{me.hearts}</span>
            </div>
            <div className="cg-label" style={{ fontSize: 8 }}>hearts</div>
          </div>
        </div>
        <div>
          <div className="cg-label" style={{ fontSize: 9, marginBottom: 6 }}>treasury · energy is derived</div>
          <div style={{ padding: "10px 11px", background: "var(--panel-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {MINERALS.map((m) => (
                <div
                  key={m}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 7px",
                    background: me.treasury[m] ? "var(--panel-3)" : "var(--panel)",
                    borderRadius: 6,
                    opacity: me.treasury[m] ? 1 : 0.5,
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Mineral m={m} />
                    <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>{MINERAL_NAME[m]}</span>
                  </span>
                  <span className="cg-num" style={{ fontSize: 16, color: me.treasury[m] ? "var(--text)" : "var(--muted-2)" }}>{me.treasury[m]}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <CGIcon name="energy" size={16} />
                <span className="cg-num" style={{ fontSize: 22, color: "var(--energy)" }}>{me.energy}</span>
                <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>energy</span>
              </div>
              <div style={{ flex: 1 }} />
              <div className="cg-mono" style={{ fontSize: 10, color: sets ? "var(--coherence)" : "var(--exploit)" }}>
                {sets ? `${sets} COGS set${sets > 1 ? "s" : ""} ×10` : "no set — singles only"}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {([["tiles", terr.tiles, "var(--text)"], ["fortresses", terr.fortresses, color], ["salients", terr.salients, "var(--exploit)"]] as const).map(([l, v, col]) => (
            <div key={l} style={{ flex: 1, padding: "8px 10px", background: "var(--panel-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div className="cg-num" style={{ fontSize: 22, color: col }}>{v}</div>
              <div className="cg-label" style={{ fontSize: 8 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Orders({ snapshot, cogId, events }: { snapshot: GameSnapshot; cogId: string; events: StampedEvent[] }): React.ReactElement {
  const turn = lastResolvedTurn(snapshot);
  const evs = eventsAt(events, turn);
  const board = evs.filter((e) => (e.type === "capture" && e.to === cogId) || (e.type === "exploit" && e.cog === cogId));
  const transfersIn = evs.filter((e) => e.type === "transfer" && e.to === cogId);
  const a = auctionAt(events, turn);
  const wonHeart = a?.winner === cogId;
  const myBid = a?.bids.find(([id]) => id === cogId)?.[1];
  return (
    <div className="cg-panel" style={{ flex: "0 0 auto", display: "flex", flexDirection: "column" }} data-testid="orders">
      <div className="cg-panel-head">
        <span className="cg-panel-title">Last Resolution</span>
        <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>{turn >= 1 ? `T${String(turn).padStart(2, "0")}` : "—"}</span>
      </div>
      <div className="cg-panel-body cg-scroll" style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5, padding: "10px 12px" }}>
        <div className="cg-label" style={{ fontSize: 8.5 }}>board actions</div>
        {board.length === 0 && <div className="cg-mono" style={{ fontSize: 10, color: "var(--muted)" }}>held — no board orders resolved.</div>}
        {board.map((e, i) => {
          if (e.type === "exploit")
            return (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 7, padding: "3px 0" }}>
                <span className="cg-verb exploit" style={{ flex: "0 0 auto" }}>EXPLOIT</span>
                <span className="cg-mono" style={{ fontSize: 10.5, color: "var(--exploit)", lineHeight: 1.4 }}>{e.tile} → +{e.minted} {e.mineral}, scarred</span>
              </div>
            );
          if (e.type === "capture")
            return (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 7, padding: "3px 0" }}>
                <span className="cg-verb align" style={{ flex: "0 0 auto" }}>{e.from ? "FLIP" : "ALIGN"}</span>
                <span className="cg-mono" style={{ fontSize: 10.5, color: "var(--text-dim)", lineHeight: 1.4 }}>{e.tile} → coherence {e.coherence}</span>
              </div>
            );
          return null;
        })}
        <div className="cg-label" style={{ fontSize: 8.5, marginTop: 6 }}>resolution</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {a && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 9px", background: wonHeart ? "rgba(255,77,157,0.08)" : "var(--panel-2)", borderRadius: 7, border: `1px solid ${wonHeart ? "rgba(255,77,157,0.35)" : "var(--border)"}` }}>
              <CGIcon name="heart" size={15} />
              <span className="cg-mono" style={{ fontSize: 10.5, color: wonHeart ? "var(--heart)" : "var(--muted)" }}>
                {wonHeart ? `Won the heart — paid ${a.price}e (2nd price)` : `Lost the auction${myBid != null ? ` · your bid ${myBid}e` : ""}`}
              </span>
            </div>
          )}
          {transfersIn.map((e, i) =>
            e.type === "transfer" ? (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 9px", background: "var(--panel-2)", borderRadius: 7, border: "1px solid var(--border)" }}>
                <span className="cg-verb transfer">RECV</span>
                <span className="cg-mono" style={{ fontSize: 10.5, color: "var(--text-dim)" }}>+{e.amount} {e.mineral} from {cogName(cogIdx(e.from))}</span>
              </div>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

function CogChannels({ snapshot, cogId, messages, onSeekTurn }: { snapshot: GameSnapshot; cogId: string; messages: Message[]; onSeekTurn?: (turn: number) => void }): React.ReactElement {
  const visible = messages
    .filter((m) => m.to === "public" || m.from === cogId || m.to === cogId)
    .slice(-30)
    .reverse();
  return (
    <div className="cg-panel" style={{ display: "flex", flexDirection: "column", minHeight: 0 }} data-testid="cog-channels">
      <div className="cg-panel-head">
        <span className="cg-panel-title">{cogName(snapshot.cogs.find((c) => c.id === cogId)?.index ?? 0)}’s Channels</span>
        <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>what it can read</span>
      </div>
      <div className="cg-panel-body cg-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7, padding: "10px 12px" }}>
        {visible.length === 0 && <div className="cg-mono" style={{ fontSize: 10, color: "var(--muted)" }}>no traffic yet.</div>}
        {visible.map((m) => (
          <ChannelMessage key={m.seq} m={m} onSeekTurn={onSeekTurn} />
        ))}
      </div>
    </div>
  );
}

export function CogView({
  snapshot,
  cogId,
  actPrompts,
  messages,
  events,
  live = false,
  onSeekTurn,
}: {
  snapshot: GameSnapshot;
  cogId: string;
  actPrompts: Record<string, ActPromptFrame[]>;
  messages: Message[];
  events: StampedEvent[];
  live?: boolean;
  onSeekTurn?: (turn: number) => void;
}): React.ReactElement {
  const [mode, setMode] = useState<LatticeMode>("coherence");
  const mine: Record<string, ActPromptFrame[]> = actPrompts[cogId] ? { [cogId]: actPrompts[cogId]! } : {};
  return (
    <div className="cg-view cg-cog" data-testid="cog-view">
      <ResizableColumns
        storageKey="cg.cols.cog"
        defaultLeft={340}
        defaultRight={320}
        left={
          <div className="cg-col cg-scroll" style={{ overflowY: "auto" }}>
            <Identity snapshot={snapshot} cogId={cogId} />
            <Orders snapshot={snapshot} cogId={cogId} events={events} />
            {live && <SteeringPanel cogId={cogId} />}
            <div className="cg-panel">
              <PromptsPanel actPrompts={mine} />
            </div>
          </div>
        }
        center={<LatticePanel snapshot={snapshot} events={events} mode={mode} setMode={setMode} highlight={cogId} />}
        right={<CogChannels snapshot={snapshot} cogId={cogId} messages={messages} onSeekTurn={onSeekTurn} />}
      />
    </div>
  );
}
