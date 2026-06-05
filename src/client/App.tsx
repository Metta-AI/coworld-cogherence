// The dashboard shell + router. Reads the URL (global / feed / cog/:id, ?live),
// connects to the matching feed source (a recorded replay file, or the live ws
// endpoint for that view), and renders the header, view switcher, the active
// view, and a shared scrubber. One snapshot list drives every view.
import React, { useEffect, useRef, useState } from "react";
import "./styles.css";
import { Scrubber } from "./Scrubber";
import { parseReplay, type Replay } from "./replay-source";
import { applyFrame, connectLiveFeed, type FeedStore } from "./net/feed";
import { makeWorldSocket } from "./net/world-socket";
import { parseLocation } from "./ui/nav";
import { AppHeader } from "./ui/AppHeader";
import { ViewSwitcher } from "./ui/ViewSwitcher";
import { GlobalView } from "./ui/GlobalView";
import { FeedView } from "./ui/FeedView";
import { CogView } from "./ui/CogView";

const emptyStore = (): FeedStore => ({
  snapshots: [],
  events: [],
  status: null,
  actPrompts: {},
  messages: [],
});

export function App({ replay: injected, live: liveProp }: { replay?: Replay; live?: boolean } = {}): React.ReactElement {
  const loc =
    typeof window !== "undefined"
      ? parseLocation(window.location)
      : { view: "global" as const, cogId: null, live: false };
  const liveMode = liveProp ?? loc.live;

  // An injected replay populates every panel (snapshots + events + chat) via the
  // same applyFrame path the fetch/live sources use — so injected mode matches.
  const storeRef = useRef<FeedStore>(
    (() => {
      const s = emptyStore();
      if (injected) for (const f of injected.frames) applyFrame(s, f);
      return s;
    })(),
  );
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);
  const [index, setIndex] = useState(0);
  const [follow, setFollow] = useState(liveMode);
  const [playing, setPlaying] = useState(false);
  const [connected, setConnected] = useState(false);

  // Replay file mode (default, non-live, not injected)
  useEffect(() => {
    if (injected || liveMode) return;
    fetch("./replay.json")
      .then((r) => r.json())
      .then((j) => {
        const s = emptyStore();
        for (const f of parseReplay(j).frames) applyFrame(s, f);
        storeRef.current = s;
        rerender();
      });
  }, [injected, liveMode]);

  // Live mode — connect to this view's ws endpoint
  useEffect(() => {
    if (!liveMode || typeof window === "undefined") return;
    const endpoint = loc.view === "cog" && loc.cogId ? `/cog/${loc.cogId}/ws` : "/global/ws";
    storeRef.current = emptyStore();
    setConnected(true);
    return connectLiveFeed(storeRef.current, () => makeWorldSocket(`ws://${window.location.host}${endpoint}`), rerender);
  }, [liveMode, loc.view, loc.cogId]);

  const store = storeRef.current;
  const snaps = store.snapshots;
  useEffect(() => {
    if ((follow || playing) && snaps.length) setIndex(snaps.length - 1);
  }, [snaps.length, follow, playing]);
  useEffect(() => {
    if (!playing || liveMode || snaps.length === 0) return;
    const id = setInterval(() => setIndex((i) => (i + 1 < snaps.length ? i + 1 : (setPlaying(false), i))), 250);
    return () => clearInterval(id);
  }, [playing, liveMode, snaps.length]);

  const snapshot = snaps.length ? snaps[Math.min(index, snaps.length - 1)]! : null;
  const cogs = snapshot ? snapshot.cogs.map((c) => ({ id: c.id, index: c.index })) : [];

  // Sync the activity ticker + chat to the scrubber: a tile's resolve/upkeep
  // events landed when the board advanced PAST their turn (event.turn < turn now
  // showing), while a turn's negotiation chat happens AT that turn (msg.turn <=).
  const turnNow = snapshot ? snapshot.turn : 0;
  const visibleEvents = store.events.filter((e) => e.turn < turnNow).map((e) => e.event);
  const visibleMessages = store.messages.filter((m) => m.turn <= turnNow);

  return (
    <div className="app">
      <AppHeader snapshot={snapshot} status={store.status} connected={connected && liveMode} />
      <ViewSwitcher view={loc.view} cogId={loc.cogId} live={liveMode} cogs={cogs} />
      {!snapshot ? (
        <p className="loading">{liveMode ? "Waiting for the live game…" : "Loading replay…"}</p>
      ) : (
        <>
          {loc.view === "global" && (
            <GlobalView
              snapshot={snapshot}
              history={snaps.slice(0, index + 1)}
              events={visibleEvents}
              actPrompts={store.actPrompts}
            />
          )}
          {loc.view === "feed" && <FeedView messages={visibleMessages} />}
          {loc.view === "cog" && loc.cogId && (
            <CogView snapshot={snapshot} cogId={loc.cogId} actPrompts={store.actPrompts} messages={visibleMessages} />
          )}
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
        </>
      )}
    </div>
  );
}
