import { describe, it, expect } from "vitest";
import { SteeringStore, steerableAgent } from "./steering-store";
import type { Agent } from "../agents/types";

describe("SteeringStore", () => {
  it("defaults to no persona, not paused, no queue", () => {
    const s = new SteeringStore();
    expect(s.get("cog0")).toEqual({ persona: "", paused: false, pending: [] });
    expect(s.persona("cog0")).toBe("");
    expect(s.paused("cog0")).toBe(false);
  });

  it("merges partial updates, leaving untouched fields intact", () => {
    const s = new SteeringStore();
    s.update("cog0", { persona: "play aggressively" });
    expect(s.get("cog0")).toEqual({ persona: "play aggressively", paused: false, pending: [] });
    s.update("cog0", { paused: true });
    expect(s.get("cog0")).toEqual({ persona: "play aggressively", paused: true, pending: [] }); // persona kept
    s.update("cog0", { pending: [{ type: "bid", energy: 3 }] });
    expect(s.get("cog0").pending).toEqual([{ type: "bid", energy: 3 }]); // persona + paused kept
    expect(s.get("cog0").paused).toBe(true);
  });

  it("takePending consumes the queue exactly once", () => {
    const s = new SteeringStore();
    s.update("cog0", { pending: [{ type: "exploit", tile: "0,0" }] });
    expect(s.takePending("cog0")).toEqual([{ type: "exploit", tile: "0,0" }]);
    expect(s.takePending("cog0")).toEqual([]); // consumed
    expect(s.get("cog0").pending).toEqual([]);
  });

  it("isolates cogs from each other", () => {
    const s = new SteeringStore();
    s.update("cog0", { paused: true });
    expect(s.paused("cog0")).toBe(true);
    expect(s.paused("cog1")).toBe(false);
  });
});

describe("steerableAgent", () => {
  const view = { state: {} as never, me: "cog0" as const };
  const base: Agent = { id: "cog0", commit: () => [{ type: "bid", energy: 7 }], negotiate: () => [{ to: "public", text: "hi" }] };

  it("delegates when not paused and no queue", () => {
    const store = new SteeringStore();
    const a = steerableAgent(base, store);
    expect(a.commit(view)).toEqual([{ type: "bid", energy: 7 }]);
    expect(a.negotiate!(view)).toEqual([{ to: "public", text: "hi" }]);
  });

  it("benches (no orders / no messages) when paused, without calling the agent", () => {
    const store = new SteeringStore();
    store.update("cog0", { paused: true });
    let called = false;
    const spy: Agent = { id: "cog0", commit: () => ((called = true), []), negotiate: () => ((called = true), []) };
    const a = steerableAgent(spy, store);
    expect(a.commit(view)).toEqual([]);
    expect(a.negotiate!(view)).toEqual([]);
    expect(called).toBe(false); // short-circuited; underlying model never invoked
  });

  it("queued operator orders OVERRIDE the agent's commit — even while benched — and submit once", () => {
    const store = new SteeringStore();
    store.update("cog0", { paused: true, pending: [{ type: "align", tile: "1,0", energy: 9 }] });
    let called = false;
    const spy: Agent = { id: "cog0", commit: () => ((called = true), [{ type: "bid", energy: 7 }]) };
    const a = steerableAgent(spy, store);
    expect(a.commit(view)).toEqual([{ type: "align", tile: "1,0", energy: 9 }]); // manual control wins
    expect(called).toBe(false);
    expect(a.commit(view)).toEqual([]); // queue consumed; still benched
  });

  it("preserves an absent negotiate hook", () => {
    const store = new SteeringStore();
    const a = steerableAgent({ id: "cog0", commit: () => [] }, store);
    expect(a.negotiate).toBeUndefined();
  });
});
