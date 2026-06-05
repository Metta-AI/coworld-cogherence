import { describe, it, expect, vi } from "vitest";
import { CogStateStore } from "./cog-state-store";

describe("CogStateStore", () => {
  it("resolves with the submitted payload", async () => {
    const s = new CogStateStore<string[]>("cog0");
    const armed = s.arm(1000);
    s.submit(["x"]);
    expect(await armed).toEqual(["x"]);
  });

  it("resolves null when the deadline passes with no submit", async () => {
    vi.useFakeTimers();
    const s = new CogStateStore<string[]>("cog0");
    const armed = s.arm(1000);
    vi.advanceTimersByTime(1000);
    expect(await armed).toBeNull();
    vi.useRealTimers();
  });

  it("ignores a late submit after timeout", async () => {
    vi.useFakeTimers();
    const s = new CogStateStore<string[]>("cog0");
    const armed = s.arm(1000);
    vi.advanceTimersByTime(1000);
    await armed;
    expect(() => s.submit(["late"])).not.toThrow(); // no-op after the arm resolved
    vi.useRealTimers();
  });
});
