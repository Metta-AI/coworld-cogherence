// The live turn loop: per turn, open a Commit phase (deadline-bounded), collect
// each cog's orders (default [] on timeout), resolve + upkeep, emit frames.
// Engine-pure underneath; this layer only adds timing, the coordinator, and IO.
import type { GameState, CogId } from "../shared/engine/types";
import type { Order } from "../shared/engine/orders";
import type { Agent } from "../agents/types";
import type { ServerMessage, ServerStatus } from "../shared/protocol";
import { newGame, stepTurn, scoreGame } from "../shared/engine/game";
import { addCog } from "../shared/engine/board";
import { toSnapshot } from "../shared/snapshot";
import { PhaseCoordinator } from "./phase-coordinator";
import type { MessageBus } from "./message-bus";
import type { SteeringStore } from "./steering-store";
import type { TurnEvent } from "../shared/engine/log";

type Listener = (m: ServerMessage) => void;

export class GameRunner {
  state: GameState;
  private agents: Agent[];
  private seed: number;
  private maxTurns: number;
  /** Soft auto-stop: the loop PAUSES (doesn't finish) when the next turn would
   *  exceed this; extendTurnLimit(+10) raises it and resumes. Infinity = off. */
  private turnLimit: number;
  private deadlineMs: number;
  private minTurnMs: number;
  private bus?: MessageBus;
  private steering?: SteeringStore;
  private negotiateRounds: number;
  private listeners: Listener[] = [];
  private clientCount = 0;
  private recent: Array<{ turn: number; event: TurnEvent }> = [];
  /** Bumped on reset; a running loop exits once its captured generation is stale. */
  private generation = 0;
  /** Operator pause: the run loop parks at the next turn boundary while paused.
   *  `resumeWaiters` are the parked loop's continuations, released on resume/reset. */
  private paused = false;
  private resumeWaiters: Array<() => void> = [];
  /** Game-clock pause accounting: epoch the current pause began (undefined while
   *  running) and total ms spent paused before it, so the header GAME clock can
   *  exclude paused time and freeze while paused. */
  private pausedAt: number | undefined;
  private pausedAccumMs = 0;
  /** Turn-timing (polis-style): the phase the spectator sees during the loop, its
   *  wall-clock deadline, and the live coordinator (for pending/done in status). */
  private livePhase: GameState["phase"] | null = null;
  private phaseDeadlineAt: number | undefined;
  private coord: PhaseCoordinator<Order[]> | null = null;
  /** Epoch ms the current game's run loop began (reset each reset) — header clock. */
  private startedAt: number | undefined;

  constructor(opts: {
    seed: number;
    agents: Agent[];
    maxTurns?: number;
    turnLimit?: number;
    deadlineMs?: number;
    minTurnMs?: number;
    bus?: MessageBus;
    steering?: SteeringStore;
    negotiateRounds?: number;
  }) {
    this.agents = opts.agents;
    this.seed = opts.seed;
    this.maxTurns = opts.maxTurns ?? 100;
    this.turnLimit = opts.turnLimit ?? Infinity;
    this.deadlineMs = opts.deadlineMs ?? 20_000;
    this.minTurnMs = opts.minTurnMs ?? 0;
    this.bus = opts.bus;
    this.steering = opts.steering;
    this.negotiateRounds = opts.negotiateRounds ?? 1;
    this.state = newGame(opts.seed, opts.agents.length);
  }

  /** Operator reset: abandon the current game and start a fresh one from turn 1.
   *  Bumping the generation makes any in-flight run loop exit at its next guard;
   *  we clear history (events + chat) and kick a new loop that re-broadcasts. */
  reset(): void {
    this.generation += 1;
    this.state = newGame(this.seed, this.agents.length);
    this.recent = [];
    this.coord = null;
    this.livePhase = null;
    this.phaseDeadlineAt = undefined;
    this.bus?.clear();
    // A fresh game always plays from a zeroed clock; release any parked stale loop.
    this.paused = false;
    this.pausedAt = undefined;
    this.pausedAccumMs = 0;
    this.releaseWaiters();
    void this.run();
  }

  /** Raise the soft auto-stop by `by` turns (capped at maxTurns) and resume. */
  extendTurnLimit(by: number): number {
    this.turnLimit = Math.min(this.maxTurns, (Number.isFinite(this.turnLimit) ? this.turnLimit : this.maxTurns) + by);
    this.setPaused(false);
    return this.turnLimit;
  }

  /** Operator pause/resume of the live turn loop. Pausing parks the loop at the
   *  next turn boundary and freezes the game clock; resuming wakes it and resumes
   *  the clock. Broadcasts the new state so menus + clocks update. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      this.pausedAt = Date.now();
    } else {
      if (this.pausedAt !== undefined) this.pausedAccumMs += Date.now() - this.pausedAt;
      this.pausedAt = undefined;
      this.releaseWaiters();
    }
    this.emit({ type: "serverStatus", status: this.status() });
  }

  /** Wake every parked run loop (resume or reset). */
  private releaseWaiters(): void {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const w of waiters) w();
  }

  /** Park the run loop while paused; wakes on resume or when its generation goes stale. */
  private async waitWhilePaused(gen: number): Promise<void> {
    while (this.paused && gen === this.generation) {
      await new Promise<void>((resolve) => this.resumeWaiters.push(resolve));
    }
  }

  /** Operator: seat a new Cog mid-game at a free corner. Applies immediately —
   *  the in-flight turn just treats it as holding (no orders collected yet) —
   *  and broadcasts the new board. Returns the seated cog's id; throws when the
   *  board is out of seats/corners (the HTTP layer surfaces that as an error). */
  addCog(makeAgent: (id: CogId) => Agent): CogId {
    const id: CogId = `cog${this.state.cogOrder.length}`;
    this.state = addCog(this.state);
    this.agents.push(makeAgent(id));
    this.emit({ type: "snapshot", snapshot: toSnapshot(this.state) });
    this.emit({ type: "serverStatus", status: this.status() });
    return id;
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
  /** Recent board events (with the turn they resolved), for backfilling a
   *  newly-connected client's ticker. */
  recentEvents(): Array<{ turn: number; event: TurnEvent }> {
    return [...this.recent];
  }
  private emit(m: ServerMessage): void {
    for (const l of this.listeners) l(m);
  }
  private status(extra: Partial<ServerStatus> = {}): ServerStatus {
    return {
      turn: this.state.turn,
      phase: this.livePhase ?? this.state.phase,
      finished: this.state.turn > this.maxTurns,
      cogCount: this.agents.length,
      clientCount: this.clientCount,
      pending: this.coord?.pending() ?? [],
      done: this.coord?.done() ?? [],
      paused: this.paused,
      pausedAccumMs: this.pausedAccumMs,
      ...(Number.isFinite(this.turnLimit) ? { turnLimit: this.turnLimit } : {}),
      ...(this.pausedAt !== undefined ? { pausedAt: this.pausedAt } : {}),
      ...(this.phaseDeadlineAt !== undefined ? { phaseDeadlineAt: this.phaseDeadlineAt } : {}),
      ...(this.startedAt !== undefined ? { startedAt: this.startedAt } : {}),
      ...extra,
    };
  }

  async run(): Promise<{ winner: CogId | null; standings: Array<{ cog: CogId; hearts: number }> }> {
    const gen = this.generation;
    this.startedAt = Date.now(); // game clock starts now (reset → a fresh clock)
    this.emit({ type: "snapshot", snapshot: toSnapshot(this.state) });
    this.emit({ type: "serverStatus", status: this.status() });

    while (this.state.turn <= this.maxTurns && gen === this.generation) {
      // Soft auto-stop: pause at the limit (the operator extends it to continue).
      if (this.state.turn > this.turnLimit && !this.paused) this.setPaused(true);
      // Operator pause parks here, at a clean turn boundary, until resume/reset.
      await this.waitWhilePaused(gen);
      if (gen !== this.generation) return scoreGame(this.state);
      if (this.state.turn > this.turnLimit) continue; // resumed without extending -> re-park

      const startedAt = Date.now();
      const snapshot = this.state;

      // Negotiate phase (free-form cheap talk): a deadline-bounded window so the
      // spectator sees a countdown here too — it's the longest cog-facing stretch.
      if (this.bus) {
        this.livePhase = "negotiate";
        this.phaseDeadlineAt = Date.now() + this.deadlineMs;
        this.emit({ type: "serverStatus", status: this.status() });
        await this.negotiateRound(snapshot, this.phaseDeadlineAt);
        this.phaseDeadlineAt = undefined;
      }

      // Commit phase: open a deadline window; broadcast it + each cog's ready flip.
      const coord = new PhaseCoordinator<Order[]>(this.agents.map((a) => a.id));
      this.coord = coord;
      this.livePhase = "commit";
      this.phaseDeadlineAt = Date.now() + this.deadlineMs;
      this.emit({ type: "serverStatus", status: this.status() });
      const collected = coord.collect(this.deadlineMs, () => [], () =>
        this.emit({ type: "serverStatus", status: this.status() }),
      );
      // Kick every agent; submissions feed the coordinator. NOT awaited: a
      // manual cog that never hits Ready parks its commit promise forever, and
      // awaiting it here would hang the turn past the deadline — `collect`
      // owns the clock and defaults missing cogs to [].
      for (const a of this.agents)
        void (async () =>
          coord.submit(a.id, await a.commit({ state: snapshot, me: a.id, messages: this.bus?.visibleTo(a.id) })))();
      const ordersByCog = await collected;
      // The window is closed: expire still-parked manual commits (keeping their
      // queues) so a LATE Ready arms for the next window instead of resolving a
      // dead promise — that path silently swallowed the operator's orders.
      this.steering?.expireWaiting();
      const commitOrder = coord.submissionOrder(); // tempo winner + auction tie-breaks
      this.coord = null;
      this.livePhase = null;
      this.phaseDeadlineAt = undefined;

      // A reset may have landed during the awaits above — drop this stale turn so
      // we don't step/emit the abandoned game over the fresh one.
      if (gen !== this.generation) return scoreGame(this.state);

      // Auction phase: the sealed heart bids settle into a single Vickrey
      // second-price winner. Its own brief, paced window so the spectator sees it
      // as a distinct phase (the engine still computes it inside stepTurn below).
      // The window is absorbed by the per-turn pace budget (minTurnMs), so the
      // overall turn cadence is unchanged.
      this.livePhase = "auction";
      this.emit({ type: "serverStatus", status: this.status() });
      const auctionMs = Math.min(this.minTurnMs, 700);
      if (auctionMs > 0) await new Promise((r) => setTimeout(r, auctionMs));
      this.livePhase = null;
      if (gen !== this.generation) return scoreGame(this.state);

      this.state = stepTurn(this.state, ordersByCog, commitOrder);
      const rec = this.state.log[this.state.log.length - 1]!;
      for (const ev of rec.events) {
        this.recent.push({ turn: rec.turn, event: ev });
        this.emit({ type: "event", event: ev, turn: rec.turn });
      }
      if (this.recent.length > 60) this.recent = this.recent.slice(-60);
      this.emit({ type: "snapshot", snapshot: toSnapshot(this.state) });
      this.emit({ type: "serverStatus", status: this.status() });

      // Pace live games so they're watchable (default 0 = instant, for tests/batch).
      const remaining = this.minTurnMs - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    }
    return scoreGame(this.state);
  }

  /** One or more rounds of cheap talk: each negotiating agent posts to the bus,
   *  seeing prior messages (so later agents can react within the round). Hard-bounded
   *  by `deadlineAt`: an agent that hasn't started past the deadline is skipped, and
   *  each in-flight `negotiate` is RACED against the remaining time so a hung/throttled
   *  model can't freeze the turn (it just posts nothing this round). */
  private async negotiateRound(snapshot: GameState, deadlineAt = Infinity): Promise<void> {
    const bus = this.bus!;
    for (let round = 0; round < this.negotiateRounds; round++) {
      for (const a of this.agents) {
        if (!a.negotiate || Date.now() >= deadlineAt) continue;
        const work = Promise.resolve(a.negotiate({ state: snapshot, me: a.id, messages: bus.visibleTo(a.id) }));
        const posts = await raceDeadline(work, deadlineAt - Date.now(), []);
        for (const p of posts) bus.post(a.id, p.to, p.text, snapshot.turn);
        this.emit({ type: "serverStatus", status: this.status() }); // refresh the countdown + chat live
      }
    }
  }
}

/** Resolve with `work`'s value, or `fallback` once `ms` elapses (and on rejection) —
 *  so a hung promise can't block the caller. The losing timer is always cleared. */
function raceDeadline<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), Math.max(0, ms));
    const done = (v: T): void => {
      clearTimeout(timer);
      resolve(v);
    };
    work.then(done, () => done(fallback));
  });
}
