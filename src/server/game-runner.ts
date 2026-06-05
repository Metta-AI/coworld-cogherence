// The live turn loop: per turn, open a Commit phase (deadline-bounded), collect
// each cog's orders (default [] on timeout), resolve + upkeep, emit frames.
// Engine-pure underneath; this layer only adds timing, the coordinator, and IO.
import type { GameState, CogId } from "../shared/engine/types";
import type { Order } from "../shared/engine/orders";
import type { Agent } from "../agents/types";
import type { ServerMessage, ServerStatus } from "../shared/protocol";
import { newGame, stepTurn, scoreGame } from "../shared/engine/game";
import { toSnapshot } from "../shared/snapshot";
import { PhaseCoordinator } from "./phase-coordinator";
import type { MessageBus } from "./message-bus";

type Listener = (m: ServerMessage) => void;

export class GameRunner {
  state: GameState;
  private agents: Agent[];
  private maxTurns: number;
  private deadlineMs: number;
  private minTurnMs: number;
  private bus?: MessageBus;
  private negotiateRounds: number;
  private listeners: Listener[] = [];
  private clientCount = 0;

  constructor(opts: {
    seed: number;
    agents: Agent[];
    maxTurns?: number;
    deadlineMs?: number;
    minTurnMs?: number;
    bus?: MessageBus;
    negotiateRounds?: number;
  }) {
    this.agents = opts.agents;
    this.maxTurns = opts.maxTurns ?? 100;
    this.deadlineMs = opts.deadlineMs ?? 20_000;
    this.minTurnMs = opts.minTurnMs ?? 0;
    this.bus = opts.bus;
    this.negotiateRounds = opts.negotiateRounds ?? 1;
    this.state = newGame(opts.seed, opts.agents.length);
  }

  onUpdate(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }
  setClientCount(n: number): void {
    this.clientCount = n;
  }
  /** Current status frame (for head-first sync to a newly-connected client). */
  currentStatus(): ServerStatus {
    return this.status();
  }
  private emit(m: ServerMessage): void {
    for (const l of this.listeners) l(m);
  }
  private status(extra: Partial<ServerStatus> = {}): ServerStatus {
    return {
      turn: this.state.turn,
      phase: this.state.phase,
      finished: this.state.turn > this.maxTurns,
      cogCount: this.agents.length,
      clientCount: this.clientCount,
      pending: [],
      done: [],
      ...extra,
    };
  }

  async run(): Promise<{ winner: CogId | null; standings: Array<{ cog: CogId; hearts: number }> }> {
    this.emit({ type: "snapshot", snapshot: toSnapshot(this.state) });
    this.emit({ type: "serverStatus", status: this.status() });

    while (this.state.turn <= this.maxTurns) {
      const startedAt = Date.now();
      const snapshot = this.state;

      // Negotiate phase (free-form cheap talk): agents post public/DM messages.
      if (this.bus) await this.negotiateRound(snapshot);

      const coord = new PhaseCoordinator<Order[]>(this.agents.map((a) => a.id));
      const collected = coord.collect(this.deadlineMs, () => []);
      // The deadline guards a hung agent: its submit never fires -> default [].
      await Promise.all(
        this.agents.map(async (a) =>
          coord.submit(a.id, await a.commit({ state: snapshot, me: a.id, messages: this.bus?.visibleTo(a.id) })),
        ),
      );
      const ordersByCog = await collected;

      this.state = stepTurn(this.state, ordersByCog);
      const rec = this.state.log[this.state.log.length - 1]!;
      for (const ev of rec.events) this.emit({ type: "event", event: ev });
      this.emit({ type: "snapshot", snapshot: toSnapshot(this.state) });
      this.emit({ type: "serverStatus", status: this.status() });

      // Pace live games so they're watchable (default 0 = instant, for tests/batch).
      const remaining = this.minTurnMs - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    }
    return scoreGame(this.state);
  }

  /** One or more rounds of cheap talk: each negotiating agent posts to the bus,
   *  seeing prior messages (so later agents can react within the round). */
  private async negotiateRound(snapshot: GameState): Promise<void> {
    const bus = this.bus!;
    for (let round = 0; round < this.negotiateRounds; round++) {
      for (const a of this.agents) {
        if (!a.negotiate) continue;
        const posts = await a.negotiate({ state: snapshot, me: a.id, messages: bus.visibleTo(a.id) });
        for (const p of posts) bus.post(a.id, p.to, p.text, snapshot.turn);
      }
    }
  }
}
