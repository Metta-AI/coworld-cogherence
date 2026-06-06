// Replay scrubber (ported from cogame-polis): play/pause, jump-to-start, step,
// and a clickable track with an animated knob, optional per-turn markers (chat
// dots + capture count), a live/replay dot, and a turn readout. Indices are
// snapshot positions; `turnAt` maps them to the displayed turn number, `marks`
// annotates each turn.
import React from "react";

export interface TurnMark {
  messages: number;
  captures: number;
}

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
  const pct = last > 0 ? (index / last) * 100 : 0;
  const posOf = (i: number) => (last > 0 ? (i / last) * 100 : 0);
  const go = (i: number) => onSeek(Math.max(0, Math.min(last, i)));
  const turn = turnAt ? turnAt(index) : index + 1;

  return (
    <div className="scrubber" data-testid="scrubber">
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
      <div
        className={`scrub-track${marks ? " has-marks" : ""}`}
        role="slider"
        aria-label="turn"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          go(Math.round(((e.clientX - r.left) / r.width) * last));
        }}
      >
        {marks && (
          <div className="scrub-marks">
            {Array.from({ length: n }, (_, i) => {
              const m = marks(i);
              if (m.messages === 0 && m.captures === 0) return null;
              return (
                <div key={i} className="scrub-mark" style={{ left: `${posOf(i)}%` }}>
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
        <div className="scrub-fill" style={{ width: `${pct}%` }} />
        <div className="scrub-knob" style={{ left: `${pct}%` }} />
      </div>
      <div className="scrub-readout">
        <span className={`scrub-dot ${live ? "is-live" : "is-replay"}`} title={live ? "live" : "replay"} />
        <span className="scrub-turn">turn {turn}</span>
      </div>
    </div>
  );
}
