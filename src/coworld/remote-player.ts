// The seam that turns an external player container into an in-process `Agent`.
// `GameRunner` drives the turn loop by calling `agent.negotiate(view)` /
// `agent.commit(view)`; a RemotePlayerAgent answers those by sending the slot's
// REDACTED view over its player WebSocket and awaiting the typed reply. The
// runner already bounds the wait (the negotiate race + the commit coordinator
// default missing answers to []), and late/duplicate submits are no-ops there,
// so this class only has to:
//   - send the request and resolve with the matching reply,
//   - resolve [] when no player is connected or the socket drops, and
//   - drop replies whose (phase, turn) don't match the open request,
//   - carry a backstop timeout so a silent player never leaks a pending promise.
import type { Agent, AgentView, Post } from "../agents/types";
import type { CogId } from "../shared/engine/types";
import type { Order } from "../shared/engine/orders";
import { redactStateFor } from "./redact-state";
import { parsePlayerMessage, type GameToPlayer, type PlayerView } from "./protocol";

/** What RemotePlayerAgent needs from a player WebSocket: a way to send text. */
export interface PlayerSink {
  send(text: string): void;
}

type Phase = "negotiate" | "commit";
interface Pending {
  phase: Phase;
  turn: number;
  resolve: (orders: Order[] | null) => void;
  posts: boolean; // true → a negotiate request (resolve carries posts via the `result` field)
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
  /** The latest negotiate posts (set when a negotiate_result lands). */
  private lastPosts: Post[] = [];

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

  /** Feed an inbound raw frame from the player socket. */
  deliver(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // not JSON — ignore
    }
    const msg = parsePlayerMessage(parsed);
    if (!msg || !this.pending) return;
    const wantNegotiate = this.pending.posts;
    if (msg.type === "negotiate_result" && wantNegotiate && msg.turn === this.pending.turn) {
      this.lastPosts = msg.posts.map((p) => ({ to: p.to, text: p.text }));
      this.settle([]); // resolve the pending negotiate (posts read from lastPosts)
    } else if (msg.type === "commit_result" && !wantNegotiate && msg.turn === this.pending.turn) {
      this.settle(msg.orders);
    }
    // anything else (wrong phase, stale turn) is dropped.
  }

  negotiate(view: AgentView): Promise<Post[]> {
    this.lastPosts = [];
    return this.request("negotiate", view).then(() => this.lastPosts);
  }

  commit(view: AgentView): Promise<Order[]> {
    return this.request("commit", view).then((orders) => orders ?? []);
  }

  // --- internals -----------------------------------------------------------

  private request(phase: Phase, view: AgentView): Promise<Order[] | null> {
    // A new request supersedes any still-open one (phases are sequential, so this
    // only fires if a prior player never answered): default the stale one.
    this.settle(null);
    const turn = view.state.turn;
    if (!this.sink) return Promise.resolve(null); // no player → passive

    const wire: PlayerView = { state: redactStateFor(view.state, this.id), me: this.id, messages: view.messages ?? [] };
    this.send({ type: phase, turn, view: wire } as GameToPlayer);
    return new Promise<Order[] | null>((resolve) => {
      this.pending = {
        phase,
        turn,
        posts: phase === "negotiate",
        resolve,
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
