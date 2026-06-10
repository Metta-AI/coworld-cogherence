// Operator steering: per-cog, runtime-editable persona text, a paused flag, and
// a queue of PENDING operator orders. The persona is prepended to a Cog's
// system prompt and re-read every turn. A paused Cog short-circuits to no
// orders / no messages without calling the model. Pending orders are queued by
// the operator (tile context menu in the cog view) and OVERRIDE the agent's
// commit for the turn they're consumed in — manual control beats autopilot.
import type { CogId } from "../shared/engine/types";
import type { Order } from "../shared/engine/orders";
import type { Agent } from "../agents/types";

export interface CogSteering {
  persona: string;
  paused: boolean;
  pending: Order[];
}

const empty = (): CogSteering => ({ persona: "", paused: false, pending: [] });

export class SteeringStore {
  private byCog = new Map<CogId, CogSteering>();

  /** Current steering for a cog (defaults: no persona, not paused, no queue). */
  get(cog: CogId): CogSteering {
    return this.byCog.get(cog) ?? empty();
  }
  /** The persona to prepend to this cog's prompt this turn ("" = none). */
  persona(cog: CogId): string {
    return this.get(cog).persona;
  }
  /** Whether this cog is currently benched by the operator. */
  paused(cog: CogId): boolean {
    return this.get(cog).paused;
  }
  /** Consume the operator's queued orders (they submit exactly once). */
  takePending(cog: CogId): Order[] {
    const cur = this.get(cog);
    if (cur.pending.length === 0) return [];
    this.byCog.set(cog, { ...cur, pending: [] });
    return cur.pending;
  }
  /** Merge a partial steering update (only provided fields change). */
  update(cog: CogId, patch: Partial<CogSteering>): CogSteering {
    const next = { ...this.get(cog), ...patch };
    this.byCog.set(cog, next);
    return next;
  }
}

/** Wrap an agent under operator steering: queued PENDING orders override the
 *  agent's commit for that turn (even while benched — manual control); with no
 *  queue, a paused Cog benches (no orders / no messages) without calling the
 *  underlying model. */
export function steerableAgent(agent: Agent, store: SteeringStore): Agent {
  return {
    id: agent.id,
    commit: (view) => {
      const pending = store.takePending(agent.id);
      if (pending.length > 0) return pending;
      return store.paused(agent.id) ? [] : agent.commit(view);
    },
    negotiate: agent.negotiate ? (view) => (store.paused(agent.id) ? [] : agent.negotiate!(view)) : undefined,
  };
}
