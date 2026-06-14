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
import { TooltipLayer } from "./cg/Tooltip";
import { GlobalView } from "./ui/GlobalView";
import { FeedView } from "./ui/FeedView";
import { CogView } from "./ui/CogView";
import { ScoresOverlay } from "./ui/ScoresOverlay";
import { Lobby } from "./ui/Lobby";

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
  // The Coworld /client/replay surface auto-plays from the first frame.
  const [playing, setPlaying] = useState(loc.replayLoop ?? false);
  const [connected, setConnected] = useState(false);
  // The end-of-game scoreboard can be dismissed to scrub the finished timeline.
  const [scoreClosed, setScoreClosed] = useState(false);

  // A /cog/<name> URL (anything that isn't a cogN id) CLAIMS that agent on the
  // live server: find-or-create by name, autopilot off — the share-a-link
  // entry point. The pretty name stays in the address bar; the resolved id
  // drives the feed and the view. Reloads re-claim (idempotent).
  const claimName = liveMode && loc.view === "cog" && loc.cogId && !/^cog\d+$/.test(loc.cogId) ? loc.cogId : null;
  const [claimed, setClaimed] = useState<{ name: string; id: string } | { name: string; error: string } | null>(null);
  useEffect(() => {
    if (!claimName) return;
    fetch("/cogs/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: claimName }) })
      .then(async (r) => {
        const j = await r.json();
        // Joining is lobby-only — once play has started, late arrivals observe
        // the global live view instead of grabbing a seat.
        if (!r.ok && j.started) {
          window.location.href = "/?live";
          return;
        }
        setClaimed(r.ok ? { name: claimName, id: j.id as string } : { name: claimName, error: (j.error as string) ?? `claim failed (${r.status})` });
      });
  }, [claimName]);
  const cogId = claimName ? (claimed && "id" in claimed && claimed.name === claimName ? claimed.id : null) : loc.cogId;
  const claimError = claimed && "error" in claimed ? claimed.error : null;

  // Replay file mode (default, non-live, not injected).
  // Absolute path: a relative "./replay.json" resolves against the current route
  // (e.g. /cog/cog0 -> /cog/replay.json), which the SPA fallback answers with
  // index.html, so the cog views never loaded. "/replay.json" is route-stable.
  useEffect(() => {
    if (injected || liveMode) return;
    fetch("/replay.json")
      .then((r) => r.json())
      .then((j) => {
        const s = emptyStore();
        for (const f of parseReplay(j).frames) applyFrame(s, f);
        storeRef.current = s;
        rerender();
      });
  }, [injected, liveMode]);

  // Live mode — connect to this view's ws endpoint (a name URL waits for its claim)
  useEffect(() => {
    if (!liveMode || typeof window === "undefined") return;
    if (loc.view === "cog" && !cogId) return; // claim in flight (or failed)
    const endpoint = loc.view === "cog" && cogId ? `/cog/${cogId}/ws` : "/global/ws";
    storeRef.current = emptyStore();
    setConnected(true);
    // Match the page protocol: an https:// page must use wss:// (browsers block a
    // mixed-content ws:// socket), while local http dev uses ws://.
    const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
    return connectLiveFeed(storeRef.current, () => makeWorldSocket(`${wsProto}://${window.location.host}${endpoint}`), rerender);
  }, [liveMode, loc.view, cogId]);

  const store = storeRef.current;
  const snaps = store.snapshots;
  useEffect(() => {
    if ((follow || playing) && snaps.length) setIndex(snaps.length - 1);
  }, [snaps.length, follow, playing]);
  useEffect(() => {
    if (!playing || liveMode || snaps.length === 0) return;
    // Replay-loop mode wraps back to turn 0 at the end (Coworld /client/replay);
    // otherwise playback stops on the last frame.
    const id = setInterval(
      () => setIndex((i) => (i + 1 < snaps.length ? i + 1 : loc.replayLoop ? 0 : (setPlaying(false), i))),
      250,
    );
    return () => clearInterval(id);
  }, [playing, liveMode, snaps.length, loc.replayLoop]);

  // Spacebar toggles the game: live -> pause/resume the server's turn loop;
  // replay -> toggle playback. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      if (liveMode) void fetch(storeRef.current.status?.paused ? "/resume" : "/pause", { method: "POST" });
      else setPlaying((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [liveMode]);

  // Lobby gate: false while the lobby collects cogs (show the Lobby overlay),
  // true once play begins. Replays/older statuses omit it — read as started.
  const started = store.status?.started ?? true;
  // The game is over when it reaches its turn limit (ended) or the hard max
  // (finished) — either way, offer the end-of-game scoreboard + Start new game.
  const gameOver = (store.status?.ended ?? false) || (store.status?.finished ?? false);
  // A new game (status no longer over) re-arms the end-of-game scoreboard.
  useEffect(() => {
    if (!gameOver) setScoreClosed(false);
  }, [gameOver]);

  const snapshot = snaps.length ? snaps[Math.min(index, snaps.length - 1)]! : null;
  const cogs = snapshot ? snapshot.cogs.map((c) => ({ id: c.id, index: c.index })) : [];
  const paused = store.status?.paused ?? false;

  // Sync the activity ticker + chat to the scrubber: a tile's resolve/upkeep
  // events landed when the board advanced PAST their turn (event.turn < turn now
  // showing), while a turn's negotiation chat happens AT that turn (msg.turn <=).
  const turnNow = snapshot ? snapshot.turn : 0;
  const visibleEvents = store.events.filter((e) => e.turn < turnNow); // stamped {turn, event} — what produced the shown board
  const visibleMessages = store.messages.filter((m) => m.turn <= turnNow);

  // Seek to the snapshot showing a given turn (clicking a message's turn chip).
  const seekTurn = (turn: number): void => {
    const i = snaps.findIndex((s) => s.turn === turn);
    if (i >= 0) {
      setFollow(false);
      setIndex(i);
    }
  };

  return (
    <div className="app">
      <TooltipLayer />
      <AppHeader
        snapshot={snapshot}
        status={store.status}
        connected={connected && liveMode}
        view={loc.view}
        cogId={cogId}
        live={liveMode}
        cogs={cogs}
      />
      {claimError ? (
        <p className="loading">
          Couldn’t claim “{claimName}” — {claimError}
        </p>
      ) : !snapshot ? (
        <p className="loading">{claimName && !cogId ? `Claiming ${claimName}…` : liveMode ? "Waiting for the live game…" : "Loading replay…"}</p>
      ) : (
        <>
          {loc.view === "global" && (
            <GlobalView snapshot={snapshot} events={visibleEvents} messages={visibleMessages} onSeekTurn={seekTurn} live={liveMode} status={store.status} />
          )}
          {loc.view === "feed" && <FeedView messages={visibleMessages} />}
          {loc.view === "cog" && cogId && (
            <CogView
              snapshot={snapshot}
              cogId={cogId}
              messages={visibleMessages}
              events={visibleEvents}
              live={liveMode}
              atLatest={index >= snaps.length - 1}
              onSeekTurn={seekTurn}
              prompts={store.actPrompts[cogId] ?? []}
            />
          )}
          <Scrubber
            snapshots={snaps}
            events={store.events}
            index={index}
            onSeek={(i) => {
              // jumping to the newest turn re-engages follow: new turns keep advancing the board
              setFollow(liveMode && i >= snaps.length - 1);
              setIndex(i);
            }}
            turnLimit={liveMode ? store.status?.turnLimit : undefined}
            waitReady={liveMode ? store.status?.waitReady : undefined}
            playing={liveMode ? !paused : playing}
            onTogglePlay={() => {
              // live: the transport's play/pause IS the game's pause/resume
              if (liveMode) void fetch(paused ? "/resume" : "/pause", { method: "POST" });
              else setPlaying((p) => !p);
            }}
            live={liveMode && follow}
          />
        </>
      )}
      {liveMode && gameOver && !scoreClosed && snapshot && (
        <ScoresOverlay
          snapshot={snaps[snaps.length - 1] ?? snapshot}
          onNewGame={() => {
            void fetch("/reset", { method: "POST" });
            setScoreClosed(false);
          }}
          onClose={() => setScoreClosed(true)}
        />
      )}
      {liveMode && !started && store.status && (
        <Lobby
          status={store.status}
          onAddBot={() => void fetch("/cogs/add", { method: "POST" })}
          onJoin={(nm) => {
            void fetch("/cogs/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nm }) }).then((r) => {
              if (r.ok) window.location.href = `/cog/${encodeURIComponent(nm)}?live`;
            });
          }}
          onStart={() => void fetch("/start", { method: "POST" })}
          onRemove={(id) => void fetch(`/cog/${id}/kick`, { method: "POST" })}
        />
      )}
    </div>
  );
}
