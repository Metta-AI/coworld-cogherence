// Replay scrubber (cogame-polis style): play/pause, jump-to-start, step, and a
// clickable track. The track is a LOCAL ZOOM window over the game — by default a
// slice of turns around the playhead (so individual turns stay readable/clickable
// even in a long game), wheel to zoom in/out. A full-range overview bar above it
// spans turn 1 → now; click it to jump anywhere. Per-turn markers (chat dots +
// capture count), a live/replay dot, and a turn readout. ←/→ step one turn.
import React, { useEffect, useRef, useState } from "react";

export interface TurnMark {
  messages: number;
  captures: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function Scrubber({
  index,
  count,
  onSeek,
  playing,
  onTogglePlay,
  live = false,
  turnAt,
  marks,
}: {
  index: number;
  count: number;
  onSeek: (i: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  /** Following the live head (green dot) vs replaying a past turn (red dot). */
  live?: boolean;
  /** Snapshot index → the turn number shown in the readout. */
  turnAt?: (i: number) => number;
  /** Optional per-index annotations rendered as markers on the track. */
  marks?: (i: number) => TurnMark;
}): React.ReactElement {
  const n = Math.max(1, count);
  const last = n - 1;
  const [winSize, setWinSize] = useState(30); // turns visible in the zoom window
  const turn = (i: number): number => (turnAt ? turnAt(i) : i + 1);
  const go = (i: number): void => onSeek(clamp(Math.round(i), 0, last));

  // ←/→ step one turn back/forward. Register once and read the latest state via a
  // ref (the parent re-renders often and hands a fresh onSeek each time). Ignored
  // while typing in a field so it doesn't fight text entry / caret movement.
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
      s.index = next; // optimistic: a held/rapid repeat keeps stepping before the re-render lands
      s.onSeek(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The local-zoom window [lo..hi], centered on the playhead and clamped to range.
  const win = Math.min(winSize, n);
  const zoomed = win < n;
  const lo = zoomed ? clamp(index - Math.floor(win / 2), 0, last - (win - 1)) : 0;
  const hi = zoomed ? lo + (win - 1) : last;
  const span = Math.max(1, hi - lo);
  const winPct = (i: number): number => ((i - lo) / span) * 100;
  const seekFromTrack = (e: React.MouseEvent): void => {
    const r = e.currentTarget.getBoundingClientRect();
    go(lo + ((e.clientX - r.left) / r.width) * span);
  };
  const seekFromOverview = (e: React.MouseEvent): void => {
    const r = e.currentTarget.getBoundingClientRect();
    go(((e.clientX - r.left) / r.width) * last);
  };
  const onWheel = (e: React.WheelEvent): void => {
    // wheel up → zoom in (fewer turns), down → zoom out; clamp to [6, all]
    setWinSize((w) => clamp((e.deltaY < 0 ? w - 4 : w + 4), 6, Math.max(6, n)));
  };

  const winMarks = marks
    ? Array.from({ length: win }, (_, k) => lo + k).filter((i) => {
        const m = marks(i);
        return m.messages > 0 || m.captures > 0;
      })
    : [];

  return (
    <div className="scrubber" data-testid="scrubber">
      <div className="scrub-controls">
        <button className="scrub-btn" aria-label={playing ? "pause" : "play"} onClick={onTogglePlay}>
          {playing ? "⏸" : "▶"}
        </button>
        <button className="scrub-btn" aria-label="jump to start" onClick={() => go(0)}>
          ⏮
        </button>
        <button className="scrub-btn" aria-label="step back" onClick={() => go(index - 1)}>
          ◀
        </button>
        <button className="scrub-btn" aria-label="step forward" onClick={() => go(index + 1)}>
          ▶
        </button>
      </div>

      <div className="scrub-main">
        {zoomed && (
          <div className="scrub-overview" title="whole game — click to jump" onClick={seekFromOverview} data-testid="scrub-overview">
            <div className="scrub-ov-window" style={{ left: `${(lo / last) * 100}%`, width: `${(span / last) * 100}%` }} />
            <div className="scrub-ov-head" style={{ left: `${(index / last) * 100}%` }} />
          </div>
        )}
        <div
          className={`scrub-track${marks ? " has-marks" : ""}`}
          role="slider"
          aria-label="turn"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={index}
          onClick={seekFromTrack}
          onWheel={onWheel}
          title="scrub · scroll to zoom"
        >
          {marks && (
            <div className="scrub-marks">
              {winMarks.map((i) => {
                const m = marks(i);
                return (
                  <div key={i} className="scrub-mark" style={{ left: `${winPct(i)}%` }}>
                    {m.messages > 0 && (
                      <div className="scrub-mark-dots" title={`${m.messages} message${m.messages === 1 ? "" : "s"}`}>
                        {Array.from({ length: Math.min(m.messages, 6) }, (_, j) => (
                          <span key={j} className="scrub-mark-dot" />
                        ))}
                      </div>
                    )}
                    {m.captures > 0 && (
                      <div className="scrub-mark-cap" title={`${m.captures} capture${m.captures === 1 ? "" : "s"}`}>
                        ⬡{m.captures}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="scrub-rail" />
          <div className="scrub-fill" style={{ width: `${clamp(winPct(index), 0, 100)}%` }} />
          <div className="scrub-knob" style={{ left: `${clamp(winPct(index), 0, 100)}%` }} />
        </div>
      </div>

      <div className="scrub-readout">
        <span className={`scrub-dot ${live ? "is-live" : "is-replay"}`} title={live ? "live" : "replay"} />
        <span className="scrub-turn">turn {turn(index)}</span>
        {zoomed && <span className="scrub-of">/ {turn(last)}</span>}
      </div>
    </div>
  );
}
