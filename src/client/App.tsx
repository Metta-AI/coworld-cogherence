// The dashboard shell + router. Reads the URL (global / feed / cog/:id, ?live),
// connects to the matching feed source (a recorded replay file, or the live ws
// endpoint for that view), and renders the unified in-game chrome (the shared
// "Game Top Bar" design): a GameTopBar (cog roster + the view switcher + operator
// controls) over the active view, and a GameScrubberBar below. One snapshot list
// drives every view.
import React, { useCallback, useEffect, useRef, useState } from "react";
import "@cogweb/ui/styles.css";
import "./styles.css";
import { GameTopBar, GameScrubberBar, loadReplayFrames, portalLobbyUrl } from "@cogweb/ui";
import type { GameTopBarPlayer } from "@cogweb/ui";
import type { ClientMessage, SeatStatus } from "@cogweb/protocol";
import type { Replay } from "../shared/replay";
import { applyFrame, connectLiveFeed, type FeedStore } from "./net/feed";
import { makeCogwebDecoder } from "./net/cogweb-feed";
import { makeWorldSocket } from "./net/world-socket";
import { parseLocation, navUrl, liveFeedWsUrl } from "./ui/nav";
import { TooltipLayer } from "./cg/Tooltip";
import { GlobalView } from "./ui/GlobalView";
import { FeedView } from "./ui/FeedView";
import { CogView } from "./ui/CogView";
import { FinalScores } from "./ui/FinalScores";
import { ViewSwitcher } from "./ui/ViewSwitcher";
import { ConsoleControls } from "./ui/ConsoleControls";
import { cogColor, cogName } from "./colors";
import { leaderIndex } from "./cg/derive";
import { MAX_TURNS } from "../shared/engine/constants";
import type { GameSnapshot } from "../shared/snapshot";
import logoBlack from "./icons/logo.png";

const emptyStore = (): FeedStore => ({
  snapshots: [],
  events: [],
  status: null,
  actPrompts: {},
  messages: [],
  lobby: null,
});

// The five cogherence phases, for the scrubber's phase strip.
const PHASES = ["negotiate", "commit", "resolve", "auction", "upkeep"].map((id) => ({
  id,
  label: id[0]!.toUpperCase() + id.slice(1),
}));

// Per-event activity weight for the overview density bars (an exploit weighs more
// than a routine mint), carried over from the old bespoke scrubber.
const EVENT_W: Record<string, number> = {
  auction: 1.5,
  exploit: 4,
  abandon: 1.5,
  capture: 1,
  lost: 1,
  transfer: 1.5,
  starved: 1,
  mint: 0.4,
  firstCommit: 0.5,
  rejected: 0.5,
};

/** A heart tinted by a cog's color (the rail's leader marker). */
function Heart({ color }: { color: string }): React.ReactElement {
  return (
    <svg width={10} height={10} viewBox="0 0 24 24" style={{ flex: "0 0 auto", filter: `drop-shadow(0 0 3px ${color})` }}>
      <path
        fill={color}
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      />
    </svg>
  );
}

/** The per-turn rail detail: a leader heart + a stacked territory bar (relative
 *  share of OWNED tiles) + an exploit count — cogherence's bespoke rail cell,
 *  fed into GameScrubberBar's renderRailExtra slot. */
function railExtra(snap: GameSnapshot, exploits: number): React.ReactElement {
  const idxById = new Map(snap.cogs.map((c) => [c.id, c.index]));
  const counts = new Map<number, number>();
  let owned = 0;
  for (const t of snap.tiles) {
    if (t.alignment == null) continue;
    const ci = idxById.get(t.alignment) ?? 0;
    counts.set(ci, (counts.get(ci) ?? 0) + 1);
    owned++;
  }
  const parts = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  return (
    <>
      <Heart color={cogColor(leaderIndex(snap))} />
      <div style={{ display: "flex", flex: 1, height: 5, borderRadius: 2, overflow: "hidden", background: "var(--panel-3, #1a1d26)" }}>
        {parts.map(([ci, n]) => (
          <div key={ci} style={{ width: `${(n / Math.max(1, owned)) * 100}%`, background: cogColor(ci) }} />
        ))}
      </div>
      {exploits > 0 && <span style={{ fontSize: 9, color: "var(--exploit, #ff5a2c)" }}>✺{exploits}</span>}
    </>
  );
}

export function App({ replay: injected, live: liveProp }: { replay?: Replay; live?: boolean } = {}): React.ReactElement {
  const loc =
    typeof window !== "undefined"
      ? parseLocation(window.location)
      : { view: "global" as const, cogId: null, live: false };
  const replayUrl =
    injected || typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("replay");
  const replayMode = loc.replayLoop === true || replayUrl !== null;
  // The client is LIVE-ONLY: every server it talks to (the portal hub and the
  // Coworld host) streams the live @cogweb wire. An injected replay (embedded
  // viewer / tests) and the Coworld
  // replay route (`/client/replay`, replayLoop) render a recording instead.
  const liveMode = injected || replayUrl !== null ? false : liveProp ?? !loc.replayLoop;

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
  // The live connection's outbound channel: callbacks send @cogweb ClientMessages
  // back to the server over the SAME socket the feed reads. The ref is rebound by
  // the live effect on each (re)connect; `send` is a stable wrapper so child
  // controls keep one identity across renders.
  const sendRef = useRef<((m: ClientMessage) => void) | null>(null);
  const send = useCallback((m: ClientMessage): void => sendRef.current?.(m), []);
  const [index, setIndex] = useState(0);
  const [follow, setFollow] = useState(liveMode);
  // The Coworld /client/replay surface auto-plays from the first frame.
  const [playing, setPlaying] = useState(replayMode);
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The cog view is keyed by a `cogN` seat id from the URL — its own per-seat
  // redacted feed (under the cogweb hub) or the public board (standalone). A
  // pretty-name URL no longer find-or-creates a seat (that was the bespoke
  // /cogs/claim plane); only a real `cogN` id resolves, otherwise the view waits.
  const cogId = loc.view === "cog" && loc.cogId && /^cog\d+$/.test(loc.cogId) ? loc.cogId : null;

  // A static Coworld viewer receives the opaque replay artifact URL in the page
  // query. Load and decode the shared @cogweb frames in-browser, then feed the
  // same bespoke adapter/store that the live socket uses.
  useEffect(() => {
    if (injected || replayUrl === null) return;
    const abort = new AbortController();
    storeRef.current = emptyStore();
    setConnected(false);
    setLoadError(null);
    void loadReplayFrames(replayUrl, abort.signal).then(
      (frames) => {
        if (abort.signal.aborted) return;
        const decode = makeCogwebDecoder();
        for (const frame of frames) for (const message of decode(frame)) applyFrame(storeRef.current, message);
        rerender();
      },
      (reason: unknown) => {
        if (abort.signal.aborted) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        setLoadError(`Replay failed to load: ${message}`);
      },
    );
    return () => abort.abort();
  }, [injected, replayUrl]);

  // Feed mode — connect this view's ws. A live game streams as it plays; a Coworld
  // recording (`/client/replay`, replayLoop) streams every recorded frame on connect
  // (the @cogweb replay host) and auto-plays. A cog view waits until its `cogN` id
  // resolves; global/feed connect immediately. An injected replay skips this.
  useEffect(() => {
    if (injected || typeof window === "undefined") return;
    if (!liveMode && !loc.replayLoop) return;
    if (loc.view === "cog" && !cogId) return; // unresolved seat id
    storeRef.current = emptyStore();
    setConnected(liveMode); // the badge reads "live" only for a live game, not a replay
    // Hang the ws path off the instance prefix the page is served under (root
    // standalone/Coworld, or /<moduleId>/<instanceId> under the cogweb hub, which
    // routes the upgrade by that prefix). A host-absolute /global/ws hits the hub
    // root, where no backend answers, so the console would never connect.
    const wsUrl = liveFeedWsUrl(window.location, loc.view, cogId);
    // The wire is @cogweb/protocol everywhere; translate it into cogherence's own
    // frames for the FeedStore the whole UI renders from. The returned `send`
    // writes ClientMessages back on the live socket — the control plane.
    const conn = connectLiveFeed(storeRef.current, () => makeWorldSocket(wsUrl), rerender, makeCogwebDecoder);
    sendRef.current = conn.send;
    return () => {
      sendRef.current = null;
      conn.stop();
    };
  }, [liveMode, loc.replayLoop, loc.view, cogId]);

  const store = storeRef.current;
  const snaps = store.snapshots;
  // The game is over when it reaches its turn limit (ended) or the hard max (finished).
  // Once over, the playhead's live head is the synthetic FINAL turn (one past the last
  // snapshot) — the standings panel; scrub one tick back for the final board.
  const over = (store.status?.ended ?? false) || (store.status?.finished ?? false);
  const lastSlot = Math.max(0, snaps.length - 1) + (over ? 1 : 0);
  useEffect(() => {
    if ((follow || playing) && snaps.length) setIndex(follow && over ? lastSlot : snaps.length - 1);
  }, [snaps.length, follow, playing, over, lastSlot]);
  useEffect(() => {
    if (!playing || liveMode || snaps.length === 0) return;
    // Replay-loop mode wraps back to turn 0 at the end (Coworld /client/replay);
    // otherwise playback stops on the last frame.
    const id = setInterval(
      () => setIndex((i) => (i + 1 < snaps.length ? i + 1 : replayMode ? 0 : (setPlaying(false), i))),
      250,
    );
    return () => clearInterval(id);
  }, [playing, liveMode, snaps.length, replayMode]);

  // Spacebar toggles the game: live -> arm/disarm the auto-advance clock (the
  // @cogweb equivalent of the old pause/resume); replay -> toggle playback.
  // Ignored while typing in a field. autoAdvance off (waitReady) ≈ "paused".
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      if (liveMode) send({ type: "setAutoAdvance", on: storeRef.current.status?.waitReady ?? false });
      else setPlaying((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [liveMode, send]);

  // Lobby gate: false while the lobby is still collecting cogs, true once play
  // begins. Replays/older statuses omit it — read as started.
  const started = store.status?.started ?? true;
  // The console only renders running/finished games. A live game still in its lobby
  // (a freshly created table, or a post-reset return to lobby) belongs to the ONE
  // shared cogweb portal lobby — hand it off there instead of rendering our own.
  useEffect(() => {
    if (liveMode && !started) {
      const url = portalLobbyUrl(window.location);
      if (url) window.location.replace(url);
    }
  }, [liveMode, started]);

  const snapshot = snaps.length ? snaps[Math.min(index, snaps.length - 1)]! : null;
  // The synthetic FINAL turn is selected (one past the last snapshot): show the
  // standings panel over the view instead of a board state.
  const viewingFinal = over && index > snaps.length - 1;
  const cogs = snapshot ? snapshot.cogs.map((c) => ({ id: c.id, index: c.index })) : [];
  const status = store.status;
  const paused = status?.paused ?? false;
  const connectedLive = connected && liveMode;

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
  const onSeek = (i: number): void => {
    // Jumping to the newest slot (the FINAL tile once over, else the last snapshot)
    // re-engages follow: new turns keep advancing the board.
    setFollow(liveMode && i >= lastSlot);
    setIndex(i);
  };

  // ── unified top bar wiring ─────────────────────────────────────────────────
  const livePhase = connectedLive && status && !status.finished ? status.phase : snapshot?.phase ?? "resolve";
  const turnLimit = liveMode ? status?.turnLimit ?? null : null;
  const maxTurns = turnLimit ?? MAX_TURNS;
  const waitReady = status?.waitReady ?? false;

  // A cog's status: commit phase waits on every cog (a cog not yet in `done` is
  // still deciding → the spinning cog); everything else reads as ready.
  const cogStatus = (id: string): SeatStatus => {
    if (!connectedLive || !status || status.finished) return "ready";
    if (status.phase === "commit") return status.done.includes(id) ? "ready" : "thinking";
    return "ready";
  };

  const roster: GameTopBarPlayer[] = (snapshot?.cogs ?? []).map((c) => ({
    id: c.id,
    name: cogName(c.index),
    status: cogStatus(c.id),
    isYou: c.id === cogId,
    nameColor: cogColor(c.index),
    title: cogName(c.index),
    score: <span style={{ color: cogColor(c.index) }}>{c.hearts}♥</span>,
  }));

  // ── scrubber wiring (overview density + per-turn detail) ───────────────────
  const weightByTurn = new Map<number, number>();
  const exploitsByTurn = new Map<number, number>();
  for (const { turn, event } of store.events) {
    weightByTurn.set(turn, (weightByTurn.get(turn) ?? 0) + (EVENT_W[event.type] ?? 1));
    if (event.type === "exploit") exploitsByTurn.set(turn, (exploitsByTurn.get(turn) ?? 0) + 1);
  }
  const maxW = Math.max(1, ...weightByTurn.values());

  return (
    <div className="app">
      <TooltipLayer />
      <GameTopBar
        game={{
          name: "Cogherence",
          logoSrc: logoBlack,
          phaseLine: snapshot ? `Turn ${turnNow} · ${livePhase[0]!.toUpperCase()}${livePhase.slice(1)}` : "",
        }}
        menu={
          liveMode
            ? { onFeedView: () => window.location.assign(navUrl(window.location, "feed", null, liveMode)), onReturnToLobby: () => send({ type: "reset" }) }
            : replayUrl === null
              ? { onFeedView: () => window.location.assign(navUrl(window.location, "feed", null, liveMode)) }
              : undefined
        }
        players={roster}
        leading={replayUrl === null ? <ViewSwitcher view={loc.view} cogId={cogId} live={liveMode} cogs={cogs} /> : undefined}
        trailing={<ConsoleControls status={status} connected={connectedLive} live={liveMode} paused={paused} send={send} />}
      />
      {!snapshot ? (
        <p className="loading">{loadError ?? (liveMode ? "Waiting for the live game…" : "Loading replay…")}</p>
      ) : (
        <>
          {/* The view region: the active view, with the FINAL standings panel filling
              it on the synthetic FINAL turn. Kept out of the scrubber row so the bar
              stays live and the operator scrubs in and out of the score. */}
          <div className="cg-stage" style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {loc.view === "global" && (
              <GlobalView snapshot={snapshot} events={visibleEvents} messages={visibleMessages} onSeekTurn={seekTurn} live={liveMode} status={status} send={send} />
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
                lobby={store.lobby}
                send={send}
              />
            )}
            {viewingFinal && <FinalScores snapshot={snaps[snaps.length - 1] ?? snapshot} onNewGame={() => send({ type: "rematch" })} />}
          </div>
          <GameScrubberBar
            timeline={snaps}
            index={Math.min(index, lastSlot)}
            onSeek={onSeek}
            meta={(snap) => {
              const resolved = snap.turn - 1;
              return {
                turn: Math.min(snap.turn, maxTurns),
                density: (weightByTurn.get(resolved) ?? 0) / maxW,
                leaderColor: cogColor(leaderIndex(snap)),
                key: (exploitsByTurn.get(resolved) ?? 0) > 0,
              };
            }}
            phases={PHASES}
            currentPhase={livePhase}
            phaseWord="Turn"
            maxTurns={maxTurns}
            final={over}
            autoAdvance={
              liveMode && status
                ? {
                    on: !waitReady,
                    // The live clock IS @cogweb auto-advance: arming it resumes the
                    // table, disarming it waits on every seat. setAutoAdvance(on)
                    // is the single seam (the old /wait-ready route is gone).
                    onToggle: () => send({ type: "setAutoAdvance", on: waitReady }),
                    deadline: paused || status.finished ? null : status.phaseDeadlineAt ?? null,
                  }
                : undefined
            }
            renderRailExtra={(snap) => railExtra(snap, exploitsByTurn.get(snap.turn - 1) ?? 0)}
          />
        </>
      )}
    </div>
  );
}
