// A single Cog's HUD: its identity (treasury → derived energy, territory shape),
// the full Turn Log, what its model saw + decided, and the channels it can
// read — beside the public lattice with its own territory in focus.
import React, { useCallback, useEffect, useState } from "react";
import type { GameSnapshot } from "../../shared/snapshot";
import type { Message } from "../../shared/messages";
import type { StampedEvent } from "../net/feed";
import type { LatticeMode } from "../HexBoard";
import type { Order } from "../../shared/engine/orders";
import { distance } from "../../shared/engine/hex";
import { ALIGN_MAX_ENERGY, COHERENCE_MAX, EXPLOIT_MULT } from "../../shared/engine/constants";
import { cogColor, cogName } from "../colors";
import { EnergyChip, CGIcon, Mineral } from "../cg/atoms";
import { LatticePanel, ChannelMessage, TurnLog } from "../cg/panels";
import { ResizableColumns } from "../cg/ResizableColumns";
import { MINERALS, MINERAL_NAME, setsOf, territory, rankedByHearts } from "../cg/derive";
import { PromptsPanel } from "../PromptsPanel";
import { AutopilotPanel } from "./AutopilotPanel";
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
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-ui)", fontWeight: 700, fontSize: 22, color: "var(--text)", letterSpacing: "0.03em" }}>{cogName(me.index)}</div>
            <div className="cg-mono" style={{ fontSize: 10, color: "var(--muted)" }}>
              rank {rank}/{snapshot.cogs.length}
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
                <EnergyChip />
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

/** The operator's tile context menu: queue an order for this cog on the clicked
 *  tile. Owned tiles offer Reinforce (per-target-coherence energy, distance 0),
 *  Exploit (windfall shown), and Abandon (refund shown); other tiles offer
 *  Align at each reachable final coherence, costed by the sqrt curve —
 *  energy = (finalCoh + incumbent)² + distance², capped at 100e. */
function TileMenu({
  snapshot,
  cogId,
  tileKey,
  at,
  onPick,
  onClose,
}: {
  snapshot: GameSnapshot;
  cogId: string;
  tileKey: string;
  at: { x: number; y: number };
  onPick: (o: Order) => void;
  onClose: () => void;
}): React.ReactElement | null {
  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      const el = e.target as Element | null;
      if (!el?.closest?.("[data-tile-menu]")) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  const t = snapshot.tiles.find((x) => `${x.q},${x.r}` === tileKey);
  if (!t) return null;
  const mine = t.alignment === cogId;
  const myTiles = snapshot.tiles.filter((x) => x.alignment === cogId);
  const dist = mine ? 0 : myTiles.reduce((d, x) => Math.min(d, distance({ q: x.q, r: x.r }, { q: t.q, r: t.r })), Infinity);

  // align/reinforce cost per resulting coherence: arriving force must beat the
  // incumbent (enemy tiles) or simply adds (own/neutral); energy = force² + dist²
  const options: Array<{ coh: number; energy: number }> = [];
  if (mine) {
    for (let target = t.coherence + 1; target <= COHERENCE_MAX; target++) {
      options.push({ coh: target, energy: (target - t.coherence) ** 2 });
    }
  } else {
    const incumbent = t.alignment ? t.coherence : 0;
    for (let final = 1; final <= COHERENCE_MAX; final++) {
      const energy = (final + incumbent) ** 2 + dist * dist;
      if (energy <= ALIGN_MAX_ENERGY) options.push({ coh: final, energy });
    }
  }

  const W = 230;
  const x = Math.min(at.x, window.innerWidth - W - 12);
  const y = Math.min(at.y, window.innerHeight - 260);
  const row = { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" } as const;
  return (
    <div
      data-tile-menu
      className="cg-panel"
      style={{ position: "fixed", left: x, top: y, width: W, zIndex: 120, background: "rgba(14,14,24,0.97)", backdropFilter: "blur(8px)" }}
    >
      <div className="cg-panel-head" style={{ padding: "7px 11px" }}>
        <span className="cg-panel-title" style={{ fontSize: 10 }}>
          [{tileKey}] · queue for {cogName(cogIdx(cogId))}
        </span>
        <button type="button" onClick={onClose} className="cg-mono" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}>
          ✕
        </button>
      </div>
      <div className="cg-panel-body cg-scroll" style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3, maxHeight: 240, overflowY: "auto" }}>
        {mine && (
          <>
            <button type="button" className="cg-menu-row" onClick={() => onPick({ type: "exploit", tile: tileKey })}>
              <span style={row}>
                <span className="cg-verb exploit">EXPLOIT</span>
                <span className="cg-mono" style={{ fontSize: 10, color: "var(--coherence)" }}>+{EXPLOIT_MULT * t.coherence * t.density}e · scars</span>
              </span>
            </button>
            <button type="button" className="cg-menu-row" onClick={() => onPick({ type: "abandon", tile: tileKey })}>
              <span style={row}>
                <span className="cg-verb transfer">ABANDON</span>
                <span className="cg-mono" style={{ fontSize: 10, color: "var(--coherence)" }}>+{t.coherence}e</span>
              </span>
            </button>
            <div className="cg-label" style={{ fontSize: 8, padding: "5px 0 2px" }}>reinforce → coherence</div>
          </>
        )}
        {!mine && <div className="cg-label" style={{ fontSize: 8, padding: "2px 0" }}>align → final coherence{t.alignment ? ` (defender coh ${t.coherence})` : ""} · dist {dist}</div>}
        {options.length === 0 && (
          <div className="cg-mono" style={{ fontSize: 9.5, color: "var(--muted)" }}>
            {mine ? "already at max coherence." : "out of reach — no affordable force arrives."}
          </div>
        )}
        {options.map((o) => (
          <button key={o.coh} type="button" className="cg-menu-row" onClick={() => onPick({ type: "align", tile: tileKey, energy: o.energy })}>
            <span style={row}>
              <span className="cg-mono" style={{ fontSize: 10.5, color: "var(--coherence)" }}>coh={o.coh}</span>
              <span className="cg-mono" style={{ fontSize: 10.5, color: "var(--energy)" }}>{o.energy}e</span>
            </span>
          </button>
        ))}
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
  atLatest = true,
  onSeekTurn,
}: {
  snapshot: GameSnapshot;
  cogId: string;
  actPrompts: Record<string, ActPromptFrame[]>;
  messages: Message[];
  events: StampedEvent[];
  live?: boolean;
  /** Whether the board is on the newest turn — steering is read-only in the past. */
  atLatest?: boolean;
  onSeekTurn?: (turn: number) => void;
}): React.ReactElement {
  const [mode, setMode] = useState<LatticeMode>("coherence");
  const [menu, setMenu] = useState<{ tileKey: string; at: { x: number; y: number } } | null>(null);
  const [pending, setPending] = useState<Order[]>([]);
  const mine: Record<string, ActPromptFrame[]> = actPrompts[cogId] ? { [cogId]: actPrompts[cogId]! } : {};

  // The operator's queued orders live server-side (they submit at the next
  // Commit even if this page closes); refresh per turn — a commit consumes them.
  useEffect(() => {
    if (!live) return;
    let on = true;
    void fetch(`/cog/${cogId}/steering`)
      .then((r) => r.json())
      .then((st: { pending?: Order[] }) => on && setPending(st.pending ?? []));
    return () => {
      on = false;
    };
  }, [live, cogId, snapshot.turn]);
  const postPending = useCallback(
    (next: Order[]): void => {
      setPending(next);
      void fetch(`/cog/${cogId}/steering`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pending: next }),
      });
    },
    [cogId],
  );

  return (
    <div className="cg-view cg-cog" data-testid="cog-view">
      <ResizableColumns
        storageKey="cg.cols.cog"
        defaultLeft={340}
        defaultRight={320}
        left={
          <div className="cg-col cg-scroll" style={{ overflowY: "auto" }}>
            <Identity snapshot={snapshot} cogId={cogId} />
            {live && (
              <AutopilotPanel
                cogId={cogId}
                atLatest={atLatest}
                pending={pending}
                onCancelPending={(i) => postPending(pending.filter((_, j) => j !== i))}
              />
            )}
            <TurnLog snapshot={snapshot} events={events} />
            <div className="cg-panel">
              <PromptsPanel actPrompts={mine} />
            </div>
          </div>
        }
        center={
          <LatticePanel
            snapshot={snapshot}
            events={events}
            mode={mode}
            setMode={setMode}
            highlight={cogId}
            onTileClick={live && atLatest ? (key, at) => setMenu({ tileKey: key, at }) : undefined}
          />
        }
        right={<CogChannels snapshot={snapshot} cogId={cogId} messages={messages} onSeekTurn={onSeekTurn} />}
      />
      {menu && (
        <TileMenu
          snapshot={snapshot}
          cogId={cogId}
          tileKey={menu.tileKey}
          at={menu.at}
          onPick={(o) => {
            postPending([...pending, o]);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
