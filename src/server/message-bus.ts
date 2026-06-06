// The negotiation channel: Cogs post public broadcasts + private DMs here. The
// bus stamps a monotonic seq, records a bounded log, notifies subscribers (the
// websocket fan-out), and answers redacted per-cog queries. Cheap talk only —
// the engine never reads these.
import type { CogId } from "../shared/engine/types";
import type { Message, Audience } from "../shared/messages";
import { messageVisibleToCog } from "../shared/messages";

type Sub = (m: Message) => void;

export class MessageBus {
  private log: Message[] = [];
  private subs: Sub[] = [];
  private seq = 0;
  constructor(private readonly cap = 500) {}

  /** Post a message; stamps seq, appends (bounded), notifies. Returns it. */
  post(from: CogId, to: Audience, text: string, turn: number): Message {
    const m: Message = { seq: ++this.seq, turn, from, to, text };
    this.log.push(m);
    if (this.log.length > this.cap) this.log.shift();
    for (const s of this.subs) s(m);
    return m;
  }
  recent(limit = 40): Message[] {
    return this.log.slice(-limit);
  }
  /** Drop all recorded messages (subscribers kept) — used on an operator reset. */
  clear(): void {
    this.log = [];
    this.seq = 0;
  }
  /** Messages a given cog may see (public + its own sent/received DMs). */
  visibleTo(cog: CogId, limit = 40): Message[] {
    return this.log.filter((m) => messageVisibleToCog(m, cog)).slice(-limit);
  }
  onPost(fn: Sub): () => void {
    this.subs.push(fn);
    return () => (this.subs = this.subs.filter((s) => s !== fn));
  }
}
