// The turn loop, scoring, and game runner: this wires Resolve + Upkeep into a
// single turn (stepTurn), appends a TurnRecord for replay, and plays a full
// MAX_TURNS game with one Agent per Cog. Everything is pure/deterministic, so a
// game is fully reproducible from (seed, agents): no hidden state, no clocks.

import type { GameState, CogId } from "./types";
import type { Order } from "./orders";
import type { TurnRecord } from "./log";
import type { Agent } from "../agents/types";
import { generateBoard } from "./board";
import { resolve } from "./resolve";
import { upkeep } from "./upkeep";
import { maxEnergy } from "./energy";
import { MAX_TURNS } from "./constants";

/** Total Coherence across the lattice — the visible "Commons" meter. */
export function commons(state: GameState): number {
  let sum = 0;
  for (const t of Object.values(state.tiles)) sum += t.coherence;
  return sum;
}

/** A fresh game at turn 1. */
export function newGame(seed: number, numCogs: number): GameState {
  return generateBoard(seed, numCogs);
}

/** Run one full turn: Resolve -> Upkeep -> advance the turn, appending a TurnRecord. Pure. */
export function stepTurn(state: GameState, ordersByCog: Record<CogId, Order[]>): GameState {
  const r = resolve(state, ordersByCog);
  const u = upkeep(r.state);
  const hearts: Record<CogId, number> = {};
  for (const id of u.state.cogOrder) hearts[id] = u.state.cogs[id]!.hearts;
  const record: TurnRecord = {
    turn: state.turn,
    events: [...r.events, ...u.events],
    commons: commons(u.state),
    hearts,
  };
  return { ...u.state, turn: state.turn + 1, phase: "negotiate", log: [...u.state.log, record] };
}

/** Final standings: most hearts wins; tiebreak by higher maxEnergy(treasury), then lower index. */
export function scoreGame(state: GameState): {
  winner: CogId | null;
  standings: Array<{ cog: CogId; hearts: number }>;
} {
  const ranked = state.cogOrder
    .map((id) => state.cogs[id]!)
    .sort((a, b) => b.hearts - a.hearts || maxEnergy(b.treasury) - maxEnergy(a.treasury) || a.index - b.index);
  return { winner: ranked[0]?.id ?? null, standings: ranked.map((c) => ({ cog: c.id, hearts: c.hearts })) };
}

/** Play a full game of MAX_TURNS turns with one Agent per Cog. Deterministic for (seed, agents). */
export function runGame(
  seed: number,
  numCogs: number,
  agents: Agent[],
): { state: GameState; winner: CogId | null; standings: Array<{ cog: CogId; hearts: number }> } {
  let state = newGame(seed, numCogs);
  while (state.turn <= MAX_TURNS) {
    const ordersByCog: Record<CogId, Order[]> = {};
    for (const a of agents) ordersByCog[a.id] = a.commit({ state, me: a.id });
    state = stepTurn(state, ordersByCog);
  }
  return { state, ...scoreGame(state) };
}
