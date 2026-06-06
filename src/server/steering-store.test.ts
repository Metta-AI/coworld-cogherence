import { describe, it, expect } from "vitest";
import { SteeringStore, pausableAgent } from "./steering-store";
import type { Agent } from "../agents/types";

describe("SteeringStore", () => {
  it("defaults to no persona, not paused", () => {
    const s = new SteeringStore();
    expect(s.get("cog0")).toEqual({ persona: "", paused: false });
    expect(s.persona("cog0")).toBe("");
    expect(s.paused("cog0")).toBe(false);
  });

  it("merges partial updates, leaving untouched fields intact", () => {
    const s = new SteeringStore();
    s.update("cog0", { persona: "play aggressively" });
    expect(s.get("cog0")).toEqual({ persona: "play aggressively", paused: false });
    s.update("cog0", { paused: true });
    expect(s.get("cog0")).toEqual({ persona: "play aggressively", paused: true }); // persona kept
    s.update("cog0", { persona: "" });
    expect(s.get("cog0")).toEqual({ persona: "", paused: true }); // paused kept
  });

  it("isolates cogs from each other", () => {
    const s = new SteeringStore();
    s.update("cog0", { paused: true });
    expect(s.paused("cog0")).toBe(true);
    expect(s.paused("cog1")).toBe(false);
  });
});

describe("pausableAgent", () => {
  const view = { state: {} as never, me: "cog0" as const };
  const base: Agent = { id: "cog0", commit: () => [{ type: "bid", energy: 7 }], negotiate: () => [{ to: "public", text: "hi" }] };

  it("delegates when not paused", () => {
    const store = new SteeringStore();
    const a = pausableAgent(base, store);
    expect(a.commit(view)).toEqual([{ type: "bid", energy: 7 }]);
    expect(a.negotiate!(view)).toEqual([{ to: "public", text: "hi" }]);
  });

  it("benches (no orders / no messages) when paused, without calling the agent", () => {
    const store = new SteeringStore();
    store.update("cog0", { paused: true });
    let called = false;
    const spy: Agent = { id: "cog0", commit: () => ((called = true), []), negotiate: () => ((called = true), []) };
    const a = pausableAgent(spy, store);
    expect(a.commit(view)).toEqual([]);
    expect(a.negotiate!(view)).toEqual([]);
    expect(called).toBe(false); // short-circuited; underlying model never invoked
  });

  it("preserves an absent negotiate hook", () => {
    const store = new SteeringStore();
    const a = pausableAgent({ id: "cog0", commit: () => [] }, store);
    expect(a.negotiate).toBeUndefined();
  });
});
