// Operator steering: per-cog, runtime-editable persona text + a paused flag.
// The persona is prepended to a Cog's system prompt and re-read every turn, so an
// operator can nudge a live LLM mid-game ("play aggressively, betray Bob"). A
// paused Cog short-circuits to no orders / no messages without calling the model.
import type { CogId } from "../shared/engine/types";
import type { Agent } from "../agents/types";

export interface CogSteering {
  persona: string;
  paused: boolean;
}

const empty = (): CogSteering => ({ persona: "", paused: false });

export class SteeringStore {
  private byCog = new Map<CogId, CogSteering>();

  /** Current steering for a cog (defaults: no persona, not paused). */
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
  /** Merge a partial steering update (only provided fields change). */
  update(cog: CogId, patch: Partial<CogSteering>): CogSteering {
    const next = { ...this.get(cog), ...patch };
    this.byCog.set(cog, next);
    return next;
  }
}

/** Wrap an agent so it benches (no orders / no messages) while the operator has
 *  it paused — checked live each turn, without calling the underlying model. */
export function pausableAgent(agent: Agent, store: SteeringStore): Agent {
  return {
    id: agent.id,
    commit: (view) => (store.paused(agent.id) ? [] : agent.commit(view)),
    negotiate: agent.negotiate ? (view) => (store.paused(agent.id) ? [] : agent.negotiate!(view)) : undefined,
  };
}
