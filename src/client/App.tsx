// Root of the spectator client. Three sources, one render path (HexBoard +
// Scrubber + Hud over a GameSnapshot[]): an injected replay (tests), a fetched
// replay file (default), or a LIVE websocket feed (?live or live prop).
import React, { useEffect, useState } from "react";
import "./styles.css";
import { HexBoard } from "./HexBoard";
import { Scrubber } from "./Scrubber";
import { Hud } from "./Hud";
import { Roster } from "./Roster";
import { PromptsPanel } from "./PromptsPanel";
import { parseReplay, snapshots, type Replay } from "./replay-source";
import { connectLiveFeed, type FeedStore } from "./net/feed";
import { makeWorldSocket } from "./net/world-socket";
import type { GameSnapshot } from "../shared/snapshot";

export function App({ replay: injected, live }: { replay?: Replay; live?: boolean } = {}): React.ReactElement {
  const liveMode = live ?? (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("live"));
  const [snaps, setSnaps] = useState<GameSnapshot[]>(injected ? snapshots(injected) : []);
  const [index, setIndex] = useState(0);
  const [follow, setFollow] = useState<boolean>(liveMode);
  const [playing, setPlaying] = useState(false);
  const [prompts, setPrompts] = useState<FeedStore["actPrompts"]>({});

  // Replay (file) mode
  useEffect(() => {
    if (injected || liveMode) return;
    fetch("./replay.json")
      .then((r) => r.json())
      .then((j) => setSnaps(snapshots(parseReplay(j))));
  }, [injected, liveMode]);

  // Live (websocket) mode
  useEffect(() => {
    if (!liveMode || typeof window === "undefined") return;
    const store: FeedStore = { snapshots: [], events: [], status: null, actPrompts: {} };
    return connectLiveFeed(
      store,
      () => makeWorldSocket(`ws://${window.location.host}/global/ws`),
      () => {
        setSnaps([...store.snapshots]);
        setPrompts({ ...store.actPrompts });
      },
    );
  }, [liveMode]);

  // Auto-follow the head when following (live) or auto-playing
  useEffect(() => {
    if ((follow || playing) && snaps.length) setIndex(snaps.length - 1);
  }, [snaps.length, follow, playing]);

  // Replay auto-play (file mode only)
  useEffect(() => {
    if (!playing || liveMode || snaps.length === 0) return;
    const id = setInterval(() => setIndex((i) => (i + 1 < snaps.length ? i + 1 : (setPlaying(false), i))), 250);
    return () => clearInterval(id);
  }, [playing, liveMode, snaps.length]);

  if (snaps.length === 0) return <h1>Cogherence — {liveMode ? "waiting for live game…" : "loading replay…"}</h1>;
  const snap = snaps[Math.min(index, snaps.length - 1)]!;
  return (
    <div className="app">
      <h1>Cogherence{liveMode ? " · live" : ""}</h1>
      <HexBoard snapshot={snap} />
      <Scrubber
        index={index}
        count={snaps.length}
        onSeek={(i) => {
          setFollow(false);
          setIndex(i);
        }}
        playing={playing}
        onTogglePlay={() => setPlaying((p) => !p)}
      />
      <Hud snapshot={snap} />
      <Roster snapshot={snap} />
      {liveMode && <PromptsPanel actPrompts={prompts} />}
    </div>
  );
}
