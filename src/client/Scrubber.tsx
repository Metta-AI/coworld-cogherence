// The Cogherence scrubber — a 100-turn dual band. The overview is an event-
// density wash with a per-turn leader ribbon and ◆ key turns (exploits). A
// draggable lens explodes into a detailed ~12-turn rail of cards. Transport
// (play / step / first / last) and ←/→ keys drive the shared playhead in App.
import React, { useEffect, useRef, useState } from "react";
import type { GameSnapshot } from "../shared/snapshot";
import type { StampedEvent } from "./net/feed";
import { MAX_TURNS } from "../shared/engine/constants";
import { cogColor } from "./colors";
import { commonsMax, leaderIndex } from "./cg/derive";
import { CGIcon } from "./cg/atoms";

const WIN = 12;
const ACCENT = "#3ce0c0";
const W = 1000;
const H = 56;
const EVENT_W: Record<string, number> = { auction: 1.5, exploit: 4, capture: 1, transfer: 1.5, starved: 1, mint: 0.4, firstCommit: 0.5, rejected: 0.5 };
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface Meta {
  turn: number;
  commons: number;
  leader: number;
  exploits: number;
  intensity: number;
  key: boolean;
}

export function Scrubber({
  snapshots,
  events,
  index,
  onSeek,
  playing,
  onTogglePlay,
  live = false,
}: {
  snapshots: GameSnapshot[];
  events: StampedEvent[];
  index: number;
  onSeek: (i: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  /** Following the live head (teal) vs replaying a past turn (rose). */
  live?: boolean;
}): React.ReactElement {
  const N = Math.max(1, snapshots.length);
  const last = N - 1;
  const max = snapshots.length ? commonsMax(snapshots[0]!) : 1;

  // Per-turn event weight + exploit count, keyed by the resolved turn (turn-1
  // produced the board at turn). Recomputed each render — the live FeedStore
  // mutates `snapshots`/`events` in place, so a reference-keyed memo would go
  // stale as they grow (and the work here is trivial for ≤101 turns).
  const weightByTurn = new Map<number, number>();
  const exploitsByTurn = new Map<number, number>();
  for (const { turn, event } of events) {
    weightByTurn.set(turn, (weightByTurn.get(turn) ?? 0) + (EVENT_W[event.type] ?? 1));
    if (event.type === "exploit") exploitsByTurn.set(turn, (exploitsByTurn.get(turn) ?? 0) + 1);
  }
  const meta: Meta[] = snapshots.map((s): Meta => {
    const resolved = s.turn - 1;
    return {
      turn: s.turn,
      commons: s.commons,
      leader: leaderIndex(s),
      exploits: exploitsByTurn.get(resolved) ?? 0,
      intensity: weightByTurn.get(resolved) ?? 0,
      key: (exploitsByTurn.get(resolved) ?? 0) > 0,
    };
  });
  const maxW = Math.max(1, ...meta.map((m) => m.intensity));
  for (const m of meta) m.intensity /= maxW;

  const [decoupled, setDecoupled] = useState(false);
  const clampWin = (s: number): number => clamp(s, 0, Math.max(0, N - WIN));
  const [winStart, setWinStart] = useState(() => clampWin(index - WIN + 3));
  useEffect(() => {
    if (decoupled) return;
    if (index < winStart + 1 || index > winStart + WIN - 2) setWinStart(clampWin(index - WIN + 3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, decoupled, N]);

  // ←/→ step one turn. Registered once; reads latest via a ref. Ignored in inputs.
  const stepRef = useRef({ index, last, onSeek });
  stepRef.current = { index, last, onSeek };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      const s = stepRef.current;
      const next = clamp(s.index + (e.key === "ArrowLeft" ? -1 : 1), 0, s.last);
      s.index = next;
      s.onSeek(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ovRef = useRef<HTMLDivElement>(null);
  const xi = (i: number): number => (last === 0 ? 0 : (i / last) * W);
  const winX0 = xi(winStart);
  const winX1 = xi(Math.min(winStart + WIN - 1, last));

  const toIndex = (clientX: number): number => {
    const rect = ovRef.current!.getBoundingClientRect();
    return clamp(Math.round(((clientX - rect.left) / rect.width) * last), 0, last);
  };
  const onOvClick = (e: React.MouseEvent): void => {
    setDecoupled(false);
    onSeek(toIndex(e.clientX));
  };
  const onLensDown = (e: React.PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setDecoupled(true);
    const offset = toIndex(e.clientX) - winStart;
    const move = (ev: PointerEvent): void => setWinStart(clampWin(toIndex(ev.clientX) - offset));
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const recouple = (): void => {
    setDecoupled(false);
    setWinStart(clampWin(index - WIN + 3));
  };

  const winCells: number[] = [];
  for (let i = winStart; i < winStart + WIN && i <= last; i++) winCells.push(i);

  const cur = snapshots[clamp(index, 0, last)];
  const Btn = ({ children, onClick, title, wide }: { children: React.ReactNode; onClick: () => void; title: string; wide?: boolean }): React.ReactElement => (
    <button className="cg-tbtn" style={{ width: wide ? 34 : 28 }} onClick={onClick} title={title} aria-label={title}>
      {children}
    </button>
  );

  return (
    <div className="cg-scrubber" data-testid="scrubber">
      <div style={{ padding: "9px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span className="cg-label" style={{ fontSize: 9 }}>full game · {MAX_TURNS} turns</span>
          <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)" }}>event density · ◆ exploits · leader</span>
        </div>
        <div ref={ovRef} onClick={onOvClick} className="cg-ov" data-testid="scrub-overview">
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", height: H }}>
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1={g * W} y1={0} x2={g * W} y2={H - 6} stroke="var(--border)" strokeDasharray="2 4" />
            ))}
            {meta.map((m, i) => {
              const bh = 3 + m.intensity * 30;
              return <rect key={`d${i}`} x={xi(i) - 3} y={H - 6 - bh} width={6} height={bh} fill={m.exploits ? "rgba(255,90,44,0.32)" : "rgba(120,130,160,0.16)"} />;
            })}
            {meta.map((m, i) => (
              <rect key={`l${i}`} x={xi(i) - 3.2} y={H - 5} width={6.4} height={5} fill={cogColor(m.leader)} opacity={0.9} />
            ))}
            {meta.map((m, i) =>
              m.key ? (
                <g key={`b${i}`}>
                  <line x1={xi(i)} y1={2} x2={xi(i)} y2={H - 6} stroke="#ff5a2c" strokeWidth="1" opacity="0.4" />
                  <path d={`M ${xi(i)} 0 l 3 3.5 l -3 3.5 l -3 -3.5 z`} fill="#ff5a2c" />
                </g>
              ) : null,
            )}
            <rect x={winX0} y={0} width={Math.max(2, winX1 - winX0)} height={H} fill={ACCENT} fillOpacity="0.08" stroke={ACCENT} strokeOpacity="0.6" strokeWidth="1" />
            <line x1={xi(index)} y1={0} x2={xi(index)} y2={H} stroke={ACCENT} strokeWidth="1.4" />
          </svg>
          <div
            onPointerDown={onLensDown}
            onClick={(e) => e.stopPropagation()}
            title="drag to scan"
            style={{ position: "absolute", top: 0, bottom: 0, left: `${(winX0 / W) * 100}%`, width: `${(Math.max(2, winX1 - winX0) / W) * 100}%`, cursor: "grab" }}
          />
        </div>
      </div>

      <svg width="100%" height="13" viewBox={`0 0 ${W} 13`} preserveAspectRatio="none" style={{ display: "block" }}>
        <path d={`M ${winX0 + 16} 0 L 14 13`} stroke={ACCENT} strokeWidth="1" opacity="0.4" fill="none" />
        <path d={`M ${winX1 + 16} 0 L ${W - 14} 13`} stroke={ACCENT} strokeWidth="1" opacity="0.4" fill="none" />
      </svg>

      <div className="cg-rail">
        {winCells.map((i) => {
          const m = meta[i]!;
          const isNow = i === index;
          return (
            <button
              key={i}
              onClick={() => onSeek(i)}
              className={`cg-rail-card${isNow ? " on" : ""}`}
              style={{ boxShadow: isNow ? `0 0 14px ${ACCENT}44` : "none" }}
            >
              <div style={{ height: 3, borderRadius: 2, background: m.key ? "#ff5a2c" : "transparent" }} />
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span className="cg-num" style={{ fontSize: 18, color: isNow ? "var(--text)" : "var(--text-dim)", lineHeight: 0.8 }}>{String(m.turn).padStart(2, "0")}</span>
                {m.key && <span style={{ fontSize: 8, color: "#ff5a2c" }}>◆</span>}
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "var(--panel-3)", overflow: "hidden" }}>
                <div style={{ width: `${(m.commons / max) * 100}%`, height: "100%", background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: cogColor(m.leader), boxShadow: `0 0 5px ${cogColor(m.leader)}` }} />
                <span style={{ flex: 1 }} />
                {m.exploits > 0 && <span style={{ fontSize: 9, color: "var(--exploit)" }}>✺{m.exploits}</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="cg-transport">
        <div style={{ display: "flex", gap: 4 }}>
          <Btn title="First" onClick={() => onSeek(0)}>⏮</Btn>
          <Btn title="Back" onClick={() => onSeek(clamp(index - 1, 0, last))}>◀</Btn>
          <Btn title={playing ? "Pause" : "Play"} onClick={onTogglePlay} wide>{playing ? "❚❚" : "▶"}</Btn>
          <Btn title="Forward" onClick={() => onSeek(clamp(index + 1, 0, last))}>▶</Btn>
          <Btn title="Latest" onClick={() => onSeek(last)}>⏭</Btn>
        </div>
        {decoupled && (
          <button onClick={recouple} className="cg-snap">
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--coherence)" }} />
            SNAP TO PLAYHEAD
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span className={`cg-scrub-dot ${live ? "is-live" : "is-replay"}`} title={live ? "live" : "replay"} />
        {cur && (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <CGIcon name="coherence" size={15} />
            <span className="cg-mono" style={{ fontSize: 12, color: "var(--coherence)" }}>{cur.commons}</span>
            <span className="cg-mono" style={{ fontSize: 10, color: "var(--muted)" }}>commons</span>
          </div>
        )}
        {cur && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginLeft: 6 }}>
            <span className="cg-mono" style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em" }}>TURN</span>
            <span className="cg-num" style={{ fontSize: 26, color: "var(--text)", lineHeight: 0.8, marginLeft: 4 }}>{String(Math.min(cur.turn, MAX_TURNS)).padStart(2, "0")}</span>
            <span className="cg-mono" style={{ fontSize: 12, color: "var(--muted)" }}>/{MAX_TURNS}</span>
          </div>
        )}
      </div>
    </div>
  );
}
