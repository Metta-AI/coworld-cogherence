// A decoupled transparency channel: a bounded per-cog buffer of "what the brain
// saw + decided", plus a subscribe hook the websocket layer fans out. Not tied to
// the game runner — agents report here directly.
import type { CogId, Phase } from "../shared/engine/types";

export interface ActPromptEntry {
  cogId: CogId;
  turn: number;
  phase: Phase;
  content: string;
}
type Sub = (e: ActPromptEntry) => void;

export class ActPromptHub {
  private byCog = new Map<CogId, ActPromptEntry[]>();
  private subs: Sub[] = [];
  constructor(private readonly cap = 50) {}

  record(e: ActPromptEntry): void {
    const list = this.byCog.get(e.cogId) ?? [];
    list.push(e);
    if (list.length > this.cap) list.shift();
    this.byCog.set(e.cogId, list);
    for (const s of this.subs) s(e);
  }
  list(cogId: CogId): ActPromptEntry[] {
    return [...(this.byCog.get(cogId) ?? [])];
  }
  onRecord(fn: Sub): () => void {
    this.subs.push(fn);
    return () => (this.subs = this.subs.filter((s) => s !== fn));
  }
}
