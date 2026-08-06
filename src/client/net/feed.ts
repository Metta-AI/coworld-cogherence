// Live feed: connect a ServerMessage socket and apply frames to a mutable store,
// notifying on each change. The store's snapshots feed the SAME renderers the
// replay viewer uses, so live and replay share one render path. Invalid inbound
// frames are dropped (validated at this boundary). The same socket carries the
// CONTROL plane outbound: connectLiveFeed returns a `send` that writes @cogweb
// ClientMessages back to the live server.
import type { ClientMessage, LobbyState } from "@cogweb/protocol";
import type { ServerMessage, ServerStatus } from "../../shared/protocol";
import type { GameSnapshot } from "../../shared/snapshot";
import { setCogNames } from "../colors";
import type { TurnEvent } from "../../shared/engine/log";
import type { Message } from "../../shared/messages";

/** An actPrompt frame: what a Cog's model saw + decided this turn. */
export type ActPromptFrame = Extract<ServerMessage, { type: "actPrompt" }>;

/** A board event tagged with the turn it resolved on, so views can show only
 *  the events that have happened up to the scrubber's current turn. */
export interface StampedEvent {
  turn: number;
  event: TurnEvent;
}

export interface FeedStore {
  snapshots: GameSnapshot[];
  events: StampedEvent[];
  status: ServerStatus | null;
  actPrompts: Record<string, ActPromptFrame[]>;
  messages: Message[];
  /** The raw @cogweb LobbyState (seat kinds/ids, bot specs, join tokens) the
   *  control plane reads to add bots, fill seats, and steer. Null until the first
   *  lobby frame lands (and on a replay, which has no lobby). */
  lobby: LobbyState | null;
}

/** Minimal socket surface (a fake is injected in tests; real one wraps WebSocket). */
export interface LiveSocket {
  onMessage(fn: (data: string) => void): void;
  /** Fires when the underlying connection dies (or never opened). Optional so
   *  test fakes without lifecycle stay valid. */
  onClose?(fn: () => void): void;
  /** Write a raw frame back to the server (the control plane's outbound path).
   *  A write before open / after close is a no-op (the real socket guards on
   *  readyState). */
  send(data: string): void;
  close(): void;
}

/** Apply one ServerMessage to the store. Shared by the live feed and replay load
 *  so a recorded game and a live game populate every panel identically. */
export function applyFrame(store: FeedStore, m: ServerMessage): void {
  if (m.type === "snapshot") {
    // A snapshot whose turn moves backwards means the operator restarted the game
    // on this same socket — drop the abandoned game's history before the new one.
    const last = store.snapshots[store.snapshots.length - 1];
    if (last && m.snapshot.turn < last.turn) {
      store.snapshots = [];
      store.events = [];
      store.messages = [];
      store.actPrompts = {};
    }
    // ONE timeline entry per turn: operator actions (claims, converts, kicks)
    // emit mid-turn snapshots, which REPLACE the turn's entry — otherwise every
    // join would duplicate the turn in the scrubber.
    const tail = store.snapshots[store.snapshots.length - 1];
    if (tail && tail.turn === m.snapshot.turn) store.snapshots[store.snapshots.length - 1] = m.snapshot;
    else store.snapshots.push(m.snapshot);
    // display names follow the live roster — keyed by seat INDEX (kicks leave holes)
    const names: string[] = [];
    for (const c of m.snapshot.cogs) names[c.index] = c.name;
    setCogNames(names);
  } else if (m.type === "event") store.events.push({ turn: m.turn, event: m.event });
  else if (m.type === "serverStatus") store.status = m.status;
  else if (m.type === "lobby") store.lobby = m.lobby;
  else if (m.type === "actPrompt") {
    const list = (store.actPrompts[m.cogId] ??= []);
    list.push(m);
    if (list.length > 20) list.shift();
  } else if (m.type === "message") store.messages.push(m.message);
}

/** Decode one inbound @cogweb/protocol wire frame into zero or more cogherence
 *  ServerMessages (the client's internal model). Every server cogherence talks to
 *  — the hub and the Coworld host — speaks the
 *  @cogweb wire; `makeCogwebDecoder` is the translator. A decoder is stateful per
 *  connection, so {@link connectLiveFeed} builds a fresh one per socket. */
export type FeedDecoder = (raw: unknown) => ServerMessage[];

/** The live connection handle: a `stop` teardown and a `send` that writes an
 *  @cogweb ClientMessage to the CURRENT socket (the control plane). */
export interface LiveConnection {
  stop: () => void;
  send: (m: ClientMessage) => void;
}

/** Connect (and KEEP connected) a live feed: when the socket dies — server
 *  restarting, page loaded before the server was up — retry with capped
 *  backoff, wiping the store right before each reconnect so the server's
 *  backfill repopulates it cleanly (no duplicated events). `makeDecoder` builds the
 *  per-connection wire translator (`makeCogwebDecoder`). The returned `send`
 *  serializes a ClientMessage onto whichever socket is currently live (dropped if
 *  none is open — the controls are user-driven and idempotent). */
export function connectLiveFeed(
  store: FeedStore,
  makeSocket: () => LiveSocket,
  onChange: () => void,
  makeDecoder: () => FeedDecoder,
): LiveConnection {
  let stopped = false;
  let sock: LiveSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  const open = (): void => {
    if (stopped) return;
    sock = makeSocket();
    const decode = makeDecoder(); // fresh per connection — a decoder may carry state
    sock.onMessage((data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(data);
      } catch {
        return; // drop unparseable inbound
      }
      attempt = 0; // inbound traffic proves the link is healthy
      for (const msg of decode(raw)) applyFrame(store, msg);
      onChange();
    });
    sock.onClose?.(() => {
      if (stopped) return;
      const delay = Math.min(8000, 500 * 2 ** attempt++);
      timer = setTimeout(() => {
        store.snapshots = [];
        store.events = [];
        store.messages = [];
        store.actPrompts = {};
        store.status = null;
        store.lobby = null;
        onChange();
        open();
      }, delay);
    });
  };
  open();
  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      sock?.close();
    },
    send: (m) => sock?.send(JSON.stringify(m)),
  };
}
