// Collect one submission per cog for a phase: resolve when all submit OR the
// deadline hits (missing cogs get a default). Tracks pending/done for status.
import type { CogId } from "../shared/engine/types";
import { CogStateStore } from "./cog-state-store";

export class PhaseCoordinator<T = unknown> {
  private stores = new Map<CogId, CogStateStore<T>>();
  private answered = new Set<CogId>();
  private firstId: CogId | null = null;
  private onProgress: (() => void) | null = null;

  constructor(private readonly cogIds: CogId[]) {
    for (const id of cogIds) this.stores.set(id, new CogStateStore<T>(id));
  }

  /** Arm every cog; resolve when all submit or their deadline hits (-> default).
   *  `onProgress` fires after each submission (for live pending/done broadcasts). */
  async collect(deadlineMs: number, makeDefault: (id: CogId) => T, onProgress?: () => void): Promise<Record<CogId, T>> {
    this.answered.clear();
    this.firstId = null;
    this.onProgress = onProgress ?? null;
    const entries = this.cogIds.map(async (id) => {
      const v = await this.stores.get(id)!.arm(deadlineMs);
      return [id, v ?? makeDefault(id)] as const;
    });
    return Object.fromEntries(await Promise.all(entries)) as Record<CogId, T>;
  }

  submit(id: CogId, value: T): void {
    if (!this.stores.has(id)) return;
    this.firstId ??= id; // first to lock its commit this phase (the tempo winner)
    this.answered.add(id);
    this.stores.get(id)!.submit(value);
    this.onProgress?.();
  }

  /** The first cog to submit this phase (the first-mover), or null if none yet. */
  first(): CogId | null {
    return this.firstId;
  }
  /** Cogs in the order they submitted (the Set preserves insertion order) —
   *  feeds the auction's first-bidder tie-break. */
  submissionOrder(): CogId[] {
    return [...this.answered];
  }
  pending(): CogId[] {
    return this.cogIds.filter((id) => !this.answered.has(id));
  }
  done(): CogId[] {
    return this.cogIds.filter((id) => this.answered.has(id));
  }
}
