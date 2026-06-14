// The seam that turns an external player container into an in-process `Agent`.
// `GameRunner` drives the turn loop by calling `agent.commit(view)`; a
// RemotePlayerAgent answers by sending the slot's REDACTED view over its player
// WebSocket and awaiting `commit_result`. There is no negotiate phase — chat is
// async and handled by the game-server directly against the message bus.
//
// The runner already bounds the wait (the commit coordinator defaults missing
// answers to []), and late/duplicate submits are no-ops there, so this class
// only has to: send the request and resolve with the matching reply, resolve []
// when no player is connected or the socket drops, drop replies whose turn
// doesn't match the open request, and carry a backstop timeout so a silent
// player never leaks a pending promise.
import type { Agent, AgentView } from "../agents/types";
import type { CogId } from "../shared/engine/types";
import type { Order } from "../shared/engine/orders";
import { redactStateFor } from "./redact-state";
import type { GameToPlayer, PlayerToGame, PlayerView } from "./protocol";

/** What RemotePlayerAgent needs from a player WebSocket: a way to send text. */
export interface PlayerSink {
  send(text: string): void;
}

interface Pending {
  turn: number;
  resolve: (orders: Order[] | null) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export class RemotePlayerAgent implements Agent {
  readonly id: CogId;
  private readonly slot: number;
  /** Backstop timeout (ms): a hair longer than the runner's phase deadline, so
   *  the runner's own cap drives behaviour and this only prevents leaks. */
  private readonly backstopMs: number;
  private sink: PlayerSink | null = null;
  private pending: Pending | null = null;

  constructor(opts: { id: CogId; slot: number; backstopMs: number }) {
    this.id = opts.id;
    this.slot = opts.slot;
    this.backstopMs = opts.backstopMs;
  }

  get connected(): boolean {
    return this.sink !== null;
  }

  /** Bind a freshly-connected player socket. Sends the orientation `hello`. */
  attach(sink: PlayerSink, hello: GameToPlayer & { type: "hello" }): void {
    this.sink = sink;
    this.send(hello);
  }

  /** The socket closed: future turns play passively until/unless it reconnects. */
  detach(): void {
    this.sink = null;
    this.settle(null); // any open request defaults now
  }

  /** Tell the player the episode is over (best-effort) and unbind. */
  final(results: unknown): void {
    if (this.sink) this.send({ type: "final", results } as GameToPlayer);
  }

  /** Push a live (async) chat message visible to this player. */
  pushMessage(msg: GameToPlayer & { type: "message" }): void {
    this.send(msg);
  }

  /** Handle a parsed inbound player frame. Only commit_result is the agent's
   *  concern; async `message` frames are routed to the bus by the game-server. */
  deliver(msg: PlayerToGame): void {
    if (msg.type === "commit_result" && this.pending && msg.turn === this.pending.turn) {
      this.settle(msg.orders);
    }
  }

  commit(view: AgentView): Promise<Order[]> {
    // A new request supersedes any still-open one (turns are sequential, so this
    // only fires if a prior player never answered): default the stale one.
    this.settle(null);
    const turn = view.state.turn;
    if (!this.sink) return Promise.resolve([]); // no player → passive

    const wire: PlayerView = { state: redactStateFor(view.state, this.id), me: this.id, messages: view.messages ?? [] };
    this.send({ type: "commit", turn, view: wire } as GameToPlayer);
    return new Promise<Order[]>((resolve) => {
      this.pending = {
        turn,
        resolve: (orders) => resolve(orders ?? []),
        timer: setTimeout(() => this.settle(null), this.backstopMs),
      };
    });
  }

  /** Resolve the open request (if any) with `value` and clear it. Idempotent. */
  private settle(value: Order[] | null): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    if (p.timer) clearTimeout(p.timer);
    p.resolve(value);
  }

  private send(msg: GameToPlayer): void {
    this.sink?.send(JSON.stringify(msg));
  }
}
