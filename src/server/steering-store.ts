// Operator steering: per-cog, runtime-editable persona text, a paused flag, and
// a queue of PENDING operator orders. The persona is prepended to a Cog's
// system prompt and re-read every turn. Pending orders are queued by the
// operator (tile context menu in the cog view). Control modes:
//  - AUTOPILOT ON (paused=false): the agent plays; a non-empty queue overrides
//    its commit for that turn (consumed once).
//  - MANUAL (paused=true): the cog WAITS during Commit until the operator hits
//    READY (markReady), which submits the queue (possibly empty = hold) and
//    flips the cog to done. No Ready by the deadline -> the coordinator
//    defaults to [] and the queue carries over to the next turn.
import type { CogId } from "../shared/engine/types";
import type { Order } from "../shared/engine/orders";
import type { Agent } from "../agents/types";

export interface CogSteering {
  persona: string;
  paused: boolean;
  pending: Order[];
}

const empty = (): CogSteering => ({ persona: "", paused: false, pending: [] });

/** A manual cog's parked commit: its resolver plus the autopilot thunk to run
 *  if the operator flips the cog back to autopilot mid-window. */
interface WaitingCommit {
  resolve: (orders: Order[]) => void;
  autopilot: () => Order[] | Promise<Order[]>;
}

export class SteeringStore {
  private byCog = new Map<CogId, CogSteering>();
  /** Manual-mode Ready plumbing: a waiting commit, or an armed flag when Ready
   *  arrived before the commit window opened. Transient — not JSON surface. */
  private waiting = new Map<CogId, WaitingCommit>();
  private readyArmed = new Set<CogId>();

  /** Current steering for a cog (defaults: no persona, not paused, no queue). */
  get(cog: CogId): CogSteering {
    return this.byCog.get(cog) ?? empty();
  }
  /** The persona to prepend to this cog's prompt this turn ("" = none). */
  persona(cog: CogId): string {
    return this.get(cog).persona;
  }
  /** Whether this cog is under manual control (autopilot off). */
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
  /** Merge a partial steering update (only provided fields change). Flipping a
   *  WAITING manual cog back to autopilot executes it immediately: the parked
   *  commit resolves with the queue if one is staged, else the agent's own
   *  orders — the cog acts this turn instead of idling to the deadline. */
  update(cog: CogId, patch: Partial<CogSteering>): CogSteering {
    const next = { ...this.get(cog), ...patch };
    this.byCog.set(cog, next);
    if (patch.paused === false) {
      const w = this.waiting.get(cog);
      if (w) {
        this.waiting.delete(cog);
        const pending = this.takePending(cog);
        if (pending.length > 0) w.resolve(pending);
        else void Promise.resolve(w.autopilot()).then(w.resolve);
      }
    }
    return next;
  }

  /** Manual commit: resolve with the queue when the operator hits Ready (or
   *  immediately, if Ready already arrived), or with the autopilot's orders if
   *  the operator re-enables autopilot mid-window. The promise may never
   *  resolve — the coordinator's deadline defaults the cog to [] in that case. */
  awaitOrders(cog: CogId, autopilot: () => Order[] | Promise<Order[]>): Promise<Order[]> {
    if (this.readyArmed.delete(cog)) return Promise.resolve(this.takePending(cog));
    return new Promise((resolve) => this.waiting.set(cog, { resolve, autopilot }));
  }
  /** Operator READY: submit the queue now (empty queue = explicit hold). */
  markReady(cog: CogId): void {
    const w = this.waiting.get(cog);
    if (w) {
      this.waiting.delete(cog);
      w.resolve(this.takePending(cog));
    } else {
      this.readyArmed.add(cog); // commit window not open yet — fire when it is
    }
  }
}

/** Wrap an agent under operator steering: MANUAL cogs wait for the operator's
 *  Ready; on autopilot, queued PENDING orders override the agent's commit for
 *  that turn, otherwise the agent plays. Manual cogs stay silent in Negotiate. */
export function steerableAgent(agent: Agent, store: SteeringStore): Agent {
  return {
    id: agent.id,
    commit: (view) => {
      if (store.paused(agent.id)) return store.awaitOrders(agent.id, () => agent.commit(view));
      const pending = store.takePending(agent.id);
      if (pending.length > 0) return pending;
      return agent.commit(view);
    },
    negotiate: agent.negotiate ? (view) => (store.paused(agent.id) ? [] : agent.negotiate!(view)) : undefined,
  };
}
