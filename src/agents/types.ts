// The agent boundary: what a Cog policy observes (AgentView) and the single
// decision it makes each turn (Agent.commit -> Order[]). MVP is full
// observability and only the Commit-phase decision; Task 13 implements concrete
// agents against this interface. Types only.

import type { GameState, CogId } from "../shared/engine/types";
import type { Order } from "../shared/engine/orders";

/** What an agent observes when choosing its orders. MVP: full observability. */
export interface AgentView {
  state: GameState;
  me: CogId;
}

/** A Cog policy. MVP: just the Commit-phase decision (no negotiation channel yet).
 *  `commit` may be sync (scripted stubs) or async (LLM agents that await a model). */
export interface Agent {
  id: CogId;
  commit(view: AgentView): Order[] | Promise<Order[]>;
}
