// A per-cog "arm + submit" mailbox. The runner arms a phase with a deadline; the
// cog submits before it, else the arm resolves null (-> caller applies a default).
import type { CogId } from "../shared/engine/types";

export class CogStateStore<T = unknown> {
  constructor(readonly cogId: CogId) {}
  private resolve: ((v: T | null) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Open the phase; resolves with the submission or null at the deadline.
   *  A non-finite deadline (wait-ready mode) waits for the submission alone. */
  arm(deadlineMs: number): Promise<T | null> {
    return new Promise<T | null>((res) => {
      this.resolve = res;
      this.timer = Number.isFinite(deadlineMs) ? setTimeout(() => this.finish(null), deadlineMs) : null;
    });
  }

  /** The cog's submission for the open phase (no-op if none is armed). */
  submit(value: T): void {
    this.finish(value);
  }

  private finish(value: T | null): void {
    if (this.timer) clearTimeout(this.timer);
    const r = this.resolve;
    this.resolve = null;
    this.timer = null;
    if (r) r(value);
  }
}
