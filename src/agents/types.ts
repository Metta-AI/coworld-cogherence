// The agent boundary: what a Cog policy observes (AgentView) and the single
// decision it makes each turn (Agent.commit -> Order[]). MVP is full
// observability and only the Commit-phase decision; Task 13 implements concrete
// agents against this interface. Types only.

import type { GameState, CogId } from "../shared/engine/types";
import type { Order } from "../shared/engine/orders";
import type { Message, Audience } from "../shared/messages";

/** What an agent observes: the board, who it is, and recent visible messages. */
export interface AgentView {
  state: GameState;
  me: CogId;
  messages?: Message[];
}

/** A message a Cog wants to send during the Negotiate phase. */
export interface Post {
  to: Audience;
  text: string;
}

/** A Cog policy. `commit` decides orders (sync for stubs, async for LLM agents);
 *  the optional `negotiate` posts public/DM messages before committing. */
export interface Agent {
  id: CogId;
  commit(view: AgentView): Order[] | Promise<Order[]>;
  negotiate?(view: AgentView): Post[] | Promise<Post[]>;
}
