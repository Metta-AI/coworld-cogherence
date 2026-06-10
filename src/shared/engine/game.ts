// The turn loop, scoring, and game runner: this wires Resolve + Upkeep into a
// single turn (stepTurn), appends a TurnRecord for replay, and plays a full
// MAX_TURNS game with one Agent per Cog. Everything is pure/deterministic, so a
// game is fully reproducible from (seed, agents): no hidden state, no clocks.

import type { GameState, CogId, Mineral } from "./types";
import { MINERALS } from "./types";
import type { Order } from "./orders";
import type { TurnRecord, TurnEvent } from "./log";
import type { Agent } from "../../agents/types";
import { generateBoard } from "./board";
import { resolve } from "./resolve";
import { upkeep } from "./upkeep";
import { maxEnergy } from "./energy";
import { MAX_TURNS, FIRST_COMMIT_REWARD, ALIGN_REPEAT_SURCHARGE, alignEnergyCost } from "./constants";
import { alignDistance } from "./orders";

/** A fresh game at turn 1. */
export function newGame(seed: number, numCogs: number): GameState {
  return generateBoard(seed, numCogs);
}

/** Award the first-mover its tempo bonus: exactly FIRST_COMMIT_REWARD energy
 *  (next-turn money). Energy is derived, not stored, so the bonus is paid as
 *  FIRST_COMMIT_REWARD units of the cog's MOST ABUNDANT mineral — adding to the
 *  max can never complete a COGS set, so the marginal value is precisely +reward
 *  singles = +reward energy. WHO committed first is decided by the IO layer
 *  (timing lives there); the engine just applies the bonus deterministically. */
function awardFirstCommit(
  cogs: GameState["cogs"],
  firstCommitter: CogId | undefined,
): { cogs: GameState["cogs"]; event: TurnEvent | null } {
  const cog = firstCommitter ? cogs[firstCommitter] : undefined;
  if (!cog) return { cogs, event: null };
  const mineral: Mineral = MINERALS.reduce((a, b) => (cog.treasury[a] >= cog.treasury[b] ? a : b));
  const treasury = { ...cog.treasury, [mineral]: cog.treasury[mineral] + FIRST_COMMIT_REWARD };
  return {
    cogs: { ...cogs, [cog.id]: { ...cog, treasury } },
    event: { type: "firstCommit", cog: cog.id, reward: FIRST_COMMIT_REWARD },
  };
}

/** Run one full turn: Resolve -> Upkeep -> first-mover bonus -> advance the turn,
 *  appending a TurnRecord. `commitOrder` (cogs in the order they locked their
 *  Commits, from the live runner; omitted for scripted replays) breaks auction
 *  ties first-bidder-first, and its head earns the tempo bonus. Pure. */
export function stepTurn(
  state: GameState,
  ordersByCog: Record<CogId, Order[]>,
  commitOrder?: CogId[],
): GameState {
  const r = resolve(state, ordersByCog, commitOrder);
  const u = upkeep(r.state);
  const award = awardFirstCommit(u.state.cogs, commitOrder?.[0]);
  const hearts: Record<CogId, number> = {};
  for (const id of u.state.cogOrder) hearts[id] = award.cogs[id]!.hearts;
  // every order as played, ahead of its consequences — the Turn Log pairs them
  // (aligns carry their billed energy: force² + distance² + the repeat surcharge)
  const played: TurnEvent[] = state.cogOrder.flatMap((id) => {
    let alignIdx = 0;
    return (ordersByCog[id] ?? []).map((order): TurnEvent => {
      if (order.type !== "align") return { type: "order", cog: id, order };
      const cost = alignEnergyCost(order.force, alignDistance(state, id, order.tile)) + ALIGN_REPEAT_SURCHARGE * alignIdx++;
      return { type: "order", cog: id, order, cost };
    });
  });
  const record: TurnRecord = {
    turn: state.turn,
    events: [...played, ...r.events, ...u.events, ...(award.event ? [award.event] : [])],
    hearts,
  };
  return { ...u.state, cogs: award.cogs, turn: state.turn + 1, phase: "negotiate", log: [...u.state.log, record] };
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

/** Play a full game with one Agent per Cog (default MAX_TURNS). Async so LLM
 *  agents can await a model; deterministic for (seed, scripted agents). Within a
 *  turn, agents run concurrently and each sees the same pre-turn state. */
export async function runGame(
  seed: number,
  numCogs: number,
  agents: Agent[],
  maxTurns: number = MAX_TURNS,
): Promise<{ state: GameState; winner: CogId | null; standings: Array<{ cog: CogId; hearts: number }> }> {
  let state = newGame(seed, numCogs);
  while (state.turn <= maxTurns) {
    const snapshot = state;
    const orders = await Promise.all(agents.map((a) => Promise.resolve(a.commit({ state: snapshot, me: a.id }))));
    const ordersByCog: Record<CogId, Order[]> = {};
    agents.forEach((a, i) => (ordersByCog[a.id] = orders[i]!));
    state = stepTurn(state, ordersByCog);
  }
  return { state, ...scoreGame(state) };
}
