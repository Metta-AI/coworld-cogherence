// Root of the spectator client: loads a recorded replay (or an injected one for
// tests) and renders the hex lattice with a scrubber + HUD. Phase 3 swaps the
// fetch for a WorldSocket behind the same snapshot list — no render changes.
import React, { useEffect, useState } from "react";
import "./styles.css";
import { HexBoard } from "./HexBoard";
import { Scrubber } from "./Scrubber";
import { Hud } from "./Hud";
import { parseReplay, snapshots, type Replay } from "./replay-source";

export function App({ replay: injected }: { replay?: Replay } = {}): React.ReactElement {
  const [replay, setReplay] = useState<Replay | null>(injected ?? null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (injected) return;
    fetch("./replay.json")
      .then((r) => r.json())
      .then((j) => setReplay(parseReplay(j)));
  }, [injected]);

  const snaps = replay ? snapshots(replay) : [];

  useEffect(() => {
    if (!playing || snaps.length === 0) return;
    const id = setInterval(() => setIndex((i) => (i + 1 < snaps.length ? i + 1 : (setPlaying(false), i))), 250);
    return () => clearInterval(id);
  }, [playing, snaps.length]);

  if (!replay || snaps.length === 0) return <h1>Cogherence — loading replay…</h1>;
  const snap = snaps[Math.min(index, snaps.length - 1)]!;
  return (
    <div className="app">
      <h1>Cogherence</h1>
      <HexBoard snapshot={snap} />
      <Scrubber index={index} count={snaps.length} onSeek={setIndex} playing={playing} onTogglePlay={() => setPlaying((p) => !p)} />
      <Hud snapshot={snap} />
    </div>
  );
}
