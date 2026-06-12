import { describe, it, expect, vi } from "vitest";
import { PhaseCoordinator } from "./phase-coordinator";

describe("PhaseCoordinator.collect", () => {
  it("returns each cog's submission keyed by id", async () => {
    const pc = new PhaseCoordinator<string[]>(["cog0", "cog1"]);
    const p = pc.collect(1000, () => []);
    pc.submit("cog0", ["a"]);
    pc.submit("cog1", ["b"]);
    expect(await p).toEqual({ cog0: ["a"], cog1: ["b"] });
  });

  it("defaults a cog that misses the deadline", async () => {
    vi.useFakeTimers();
    const pc = new PhaseCoordinator<string[]>(["cog0", "cog1"]);
    const p = pc.collect(1000, (id) => [`default-${id}`]);
    pc.submit("cog0", ["a"]);
    vi.advanceTimersByTime(1000);
    expect(await p).toEqual({ cog0: ["a"], cog1: ["default-cog1"] });
    vi.useRealTimers();
  });

  it("exposes pending/done as cogs submit", async () => {
    const pc = new PhaseCoordinator<string[]>(["cog0", "cog1"]);
    const p = pc.collect(1000, () => []);
    expect(pc.pending()).toEqual(["cog0", "cog1"]);
    pc.submit("cog0", ["a"]);
    expect(pc.done()).toEqual(["cog0"]);
    pc.submit("cog1", ["b"]);
    await p;
  });

  it("records the first cog to submit (the tempo winner) and fires onProgress per submit", async () => {
    const pc = new PhaseCoordinator<string[]>(["cog0", "cog1", "cog2"]);
    const progress = vi.fn();
    const p = pc.collect(1000, () => [], progress);
    expect(pc.first()).toBeNull();
    pc.submit("cog2", ["a"]); // cog2 moves first
    expect(pc.first()).toBe("cog2");
    pc.submit("cog0", ["b"]);
    expect(pc.first()).toBe("cog2"); // stays the first, not the latest
    pc.submit("cog1", ["c"]);
    await p;
    expect(progress).toHaveBeenCalledTimes(3);
    expect(pc.submissionOrder()).toEqual(["cog2", "cog0", "cog1"]); // arrival order, not seat order
  });
});
