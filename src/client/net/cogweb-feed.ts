// Translate @cogweb/protocol ServerMessages — the wire the cogweb portal hub speaks
// — into cogherence's OWN ServerMessages, so the existing FeedStore / applyFrame and
// the whole rich UI render a hub-hosted game with no changes. cogherence's game
// module already produces exactly the data the client wants: the redacted view IS a
// GameSnapshot (rides in `snapshot.state`), every board event carries its TurnEvent
// (in `event.data`), and chat rides as a "talk" FeedEvent. So this is a thin
// re-envelope, not a reinterpretation.
//
// Why a separate decoder instead of migrating the client wholesale: standalone
// (cli-serve) and the Coworld game container still speak cogherence's NATIVE wire,
// and they're prod + tournament surfaces. The live socket picks the decoder by
// deployment (App.tsx): the hub speaks @cogweb, everything else speaks native.
import { ServerMessage as CogwebMessage } from "@cogweb/protocol";
import type { RunStatus, LobbyState, Audience } from "@cogweb/protocol";
import { gameSnapshotSchema, turnEventSchema } from "../../shared/protocol";
import type { ServerMessage, ServerStatus } from "../../shared/protocol";
import type { Phase } from "../../shared/engine/types";

// Seat index ↔ cog id is fixed at `cog${index}` (engine/board.ts), and the @cogweb
// seat is cogherence's cog index (the descriptor maps seat i ↔ cogOrder[i] ↔ index i).
const seatToCogId = (seat: number): string => `cog${seat}`;

// A DM's audience is a seat list on the @cogweb wire; cogherence's Message.to is a
// single cog id (its DMs are 1:1) or "public".
const audienceToCogId = (to: Audience): string => (to === "public" || to.length === 0 ? "public" : seatToCogId(to[0]!));

/** Lower a hub RunStatus + the last lobby roster into cogherence's ServerStatus.
 *  `phase` (cogherence's game phase) isn't on the wire status — it comes from the
 *  latest snapshot. The board renders from snapshots; this drives the chrome. */
function toServerStatus(run: RunStatus, phase: Phase, roster: ServerStatus["roster"]): ServerStatus {
  const finished = run.phase === "finished";
  const entries = Object.entries(run.seatStatus);
  return {
    turn: run.turn,
    phase,
    finished,
    cogCount: entries.length || Object.keys(run.scores ?? {}).length,
    clientCount: 0,
    // A seat the table is still waiting on (acting/thinking) is "pending"; the rest
    // are "done" — drives cogherence's commit-phase per-cog spinner.
    pending: entries.filter(([, s]) => s === "acting" || s === "thinking").map(([k]) => seatToCogId(Number(k))),
    done: entries.filter(([, s]) => s === "waiting" || s === "ready").map(([k]) => seatToCogId(Number(k))),
    paused: false,
    phaseDeadlineAt: run.deadline ?? undefined,
    waitReady: !run.autoAdvance,
    started: run.phase !== "lobby",
    ended: finished,
    roster,
  };
}

/** A pre-start lobby frame → a started:false ServerStatus so cogherence's Lobby
 *  overlay can render the forming roster. */
function lobbyToServerStatus(lobby: LobbyState, phase: Phase): ServerStatus {
  return {
    turn: 0,
    phase,
    finished: false,
    cogCount: lobby.seats.length,
    clientCount: 0,
    pending: [],
    done: [],
    started: lobby.phase !== "lobby",
    roster: lobby.seats.map((s) => ({ id: seatToCogId(s.seat), name: s.name, bot: s.bot !== null })),
  };
}

/** Build a stateful decoder: @cogweb ServerMessage → cogherence ServerMessage[].
 *  Stateful per CONNECTION (a seq counter for chat, the latest game phase for status,
 *  the latest roster) — make a fresh one per socket so a reconnect's backfill replays
 *  cleanly. Unparseable / unmappable frames yield []. */
export function makeCogwebDecoder(): (raw: unknown) => ServerMessage[] {
  let seq = 0;
  let phase: Phase = "negotiate";
  let roster: ServerStatus["roster"];

  return (raw: unknown): ServerMessage[] => {
    const parsed = CogwebMessage.safeParse(raw);
    if (!parsed.success) return [];
    const m = parsed.data;
    switch (m.type) {
      case "snapshot": {
        // The opaque `state` IS cogherence's GameSnapshot — validate at the boundary.
        const snap = gameSnapshotSchema.safeParse(m.snapshot.state);
        if (!snap.success) return [];
        phase = snap.data.phase;
        return [{ type: "snapshot", snapshot: snap.data }];
      }
      case "event": {
        const e = m.event;
        if (e.kind === "talk") {
          return [{ type: "message", message: { seq: seq++, turn: e.turn, from: seatToCogId(e.seat ?? -1), to: audienceToCogId(e.to), text: e.text } }];
        }
        // A board event carries its TurnEvent in `data` — validate at the boundary.
        const ev = turnEventSchema.safeParse(e.data);
        if (!ev.success) return [];
        return [{ type: "event", event: ev.data, turn: e.turn }];
      }
      case "status":
        return [{ type: "serverStatus", status: toServerStatus(m.status, phase, roster) }];
      case "lobby":
        roster = m.lobby.seats.map((s) => ({ id: seatToCogId(s.seat), name: s.name, bot: s.bot !== null }));
        // Surface BOTH: the lowered ServerStatus that drives the rest of the chrome
        // (started flag, roster chips), and the raw LobbyState the control plane
        // reads for real seat kinds / open seats / bot specs.
        return [
          { type: "serverStatus", status: lobbyToServerStatus(m.lobby, phase) },
          { type: "lobby", lobby: m.lobby },
        ];
      case "actPrompt": {
        const a = m.actPrompt;
        const last = a.attempts[a.attempts.length - 1];
        const content = last ? `${last.prompt}\n\n→ ${last.response}` : "";
        return [{ type: "actPrompt", cogId: seatToCogId(a.seat), turn: a.turn, phase: (a.phase as Phase | null) ?? phase, content }];
      }
      case "reset":
        // The next game's first snapshot (turn 1 < last turn) wipes the store via
        // applyFrame's backward-turn reset; nothing to emit here.
        return [];
    }
  };
}
