// Record a full game as a ServerMessage[] stream (the replay), plus a small
// meta-wrapped envelope for on-disk storage. These are the SAME frames the
// phase-3 live server will broadcast over websockets.
import type { Agent } from "../agents/types";
import type { CogId } from "./engine/types";
import type { Order } from "./engine/orders";
import { newGame, stepTurn } from "./engine/game";
import { MAX_TURNS } from "./engine/constants";
import { toSnapshot } from "./snapshot";
import { COGHERENCE_VERSION } from "./version";
import type { ServerMessage } from "./protocol";

export interface ReplayMeta {
  version: string;
  seed: number;
  agents: string[];
  turns: number;
}
export interface Replay {
  meta: ReplayMeta;
  frames: ServerMessage[];
}

/** Play a full game, capturing an initial snapshot then per-turn events + snapshot + status. */
export function recordGame(seed: number, agents: Agent[]): ServerMessage[] {
  const frames: ServerMessage[] = [];
  const n = agents.length;
  let state = newGame(seed, n);

  frames.push({ type: "snapshot", snapshot: toSnapshot(state) });
  frames.push({ type: "serverStatus", status: { turn: state.turn, phase: state.phase, finished: false, cogCount: n } });

  while (state.turn <= MAX_TURNS) {
    const ordersByCog: Record<CogId, Order[]> = {};
    for (const a of agents) ordersByCog[a.id] = a.commit({ state, me: a.id });
    state = stepTurn(state, ordersByCog);
    const rec = state.log[state.log.length - 1]!;
    for (const ev of rec.events) frames.push({ type: "event", event: ev });
    frames.push({ type: "snapshot", snapshot: toSnapshot(state) });
    frames.push({
      type: "serverStatus",
      status: { turn: state.turn, phase: state.phase, finished: state.turn > MAX_TURNS, cogCount: n },
    });
  }
  return frames;
}

/** Wrap a recorded game with meta for on-disk storage. */
export function makeReplay(seed: number, agentSpecs: string[], agents: Agent[]): Replay {
  return { meta: { version: COGHERENCE_VERSION, seed, agents: agentSpecs, turns: MAX_TURNS }, frames: recordGame(seed, agents) };
}
