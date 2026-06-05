// Playback controls for a replay: play/pause, step, and a turn slider.
import React from "react";

export function Scrubber({
  index,
  count,
  onSeek,
  playing,
  onTogglePlay,
}: {
  index: number;
  count: number;
  onSeek: (i: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
}): React.ReactElement {
  return (
    <div className="scrubber">
      <button aria-label={playing ? "pause" : "play"} onClick={onTogglePlay}>
        {playing ? "⏸" : "▶"}
      </button>
      <button aria-label="step back" onClick={() => onSeek(Math.max(0, index - 1))}>
        ◀
      </button>
      <input type="range" min={0} max={count - 1} value={index} onChange={(e) => onSeek(Number(e.target.value))} />
      <button aria-label="step forward" onClick={() => onSeek(Math.min(count - 1, index + 1))}>
        ▶
      </button>
    </div>
  );
}
