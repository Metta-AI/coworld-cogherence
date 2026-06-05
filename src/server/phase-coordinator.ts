// Collect one submission per cog for a phase: resolve when all submit OR the
// deadline hits (missing cogs get a default). Tracks pending/done for status.
import type { CogId } from "../shared/engine/types";
import { CogStateStore } from "./cog-state-store";

export class PhaseCoordinator<T = unknown> {
  private stores = new Map<CogId, CogStateStore<T>>();
  private answered = new Set<CogId>();

  constructor(private readonly cogIds: CogId[]) {
    for (const id of cogIds) this.stores.set(id, new CogStateStore<T>(id));
  }

  /** Arm every cog; resolve when all submit or their deadline hits (-> default). */
  async collect(deadlineMs: number, makeDefault: (id: CogId) => T): Promise<Record<CogId, T>> {
    this.answered.clear();
    const entries = this.cogIds.map(async (id) => {
      const v = await this.stores.get(id)!.arm(deadlineMs);
      return [id, v ?? makeDefault(id)] as const;
    });
    return Object.fromEntries(await Promise.all(entries)) as Record<CogId, T>;
  }

  submit(id: CogId, value: T): void {
    if (!this.stores.has(id)) return;
    this.answered.add(id);
    this.stores.get(id)!.submit(value);
  }

  pending(): CogId[] {
    return this.cogIds.filter((id) => !this.answered.has(id));
  }
  done(): CogId[] {
    return this.cogIds.filter((id) => this.answered.has(id));
  }
}
