import { describe, it, expect } from "vitest";
import { SteeringStore, steerableAgent } from "./steering-store";
import { DEFAULT_BEDROCK_MODEL } from "../shared/models";
import type { Agent } from "../agents/types";

describe("SteeringStore", () => {
  it("defaults to no persona, not paused, no queue", () => {
    const s = new SteeringStore();
    expect(s.get("cog0")).toEqual({ persona: "", paused: false, pending: [], standingBid: 0, autoConvert: [], model: DEFAULT_BEDROCK_MODEL });
    expect(s.persona("cog0")).toBe("");
    expect(s.paused("cog0")).toBe(false);
  });

  it("merges partial updates, leaving untouched fields intact", () => {
    const s = new SteeringStore();
    s.update("cog0", { persona: "play aggressively" });
    expect(s.get("cog0")).toEqual({ persona: "play aggressively", paused: false, pending: [], standingBid: 0, autoConvert: [], model: DEFAULT_BEDROCK_MODEL });
    s.update("cog0", { paused: true });
    expect(s.get("cog0")).toEqual({ persona: "play aggressively", paused: true, pending: [], standingBid: 0, autoConvert: [], model: DEFAULT_BEDROCK_MODEL }); // persona kept
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

describe("missed commit window (expireWaiting)", () => {
  const view = { state: {} as never, me: "cog0" as const };

  it("a LATE Ready arms instead of feeding the dead resolver — the queue survives to the next window", async () => {
    const store = new SteeringStore();
    store.update("cog0", { paused: true, pending: [{ type: "abandon", tile: "1,0" }] });
    const a = steerableAgent({ id: "cog0", commit: () => [] }, store);
    void a.commit(view); // window 1 opens; the operator never hits Ready
    store.expireWaiting(); // window 1 closes (the runner defaulted the cog to [])
    store.markReady("cog0"); // the operator's Ready lands late
    expect(store.get("cog0").pending).toEqual([{ type: "abandon", tile: "1,0" }]); // NOT consumed
    expect(await a.commit(view)).toEqual([{ type: "abandon", tile: "1,0" }]); // window 2: armed -> queue delivers
  });

  it("without a late Ready the queue just carries over and the cog parks again", async () => {
    const store = new SteeringStore();
    store.update("cog0", { paused: true, pending: [{ type: "exploit", tile: "0,0" }] });
    const a = steerableAgent({ id: "cog0", commit: () => [] }, store);
    void a.commit(view);
    store.expireWaiting();
    const second = a.commit(view) as Promise<unknown>; // window 2: parked again, queue intact
    store.markReady("cog0");
    expect(await second).toEqual([{ type: "exploit", tile: "0,0" }]);
  });
});

describe("standing bid", () => {
  const view = { state: {} as never, me: "cog0" as const };

  it("rides along with the autopilot's commit, replacing the agent's own bid", async () => {
    const store = new SteeringStore();
    store.update("cog0", { standingBid: 9 });
    const a = steerableAgent({ id: "cog0", commit: () => [{ type: "exploit", tile: "0,0" }, { type: "bid", energy: 2 }] }, store);
    expect(await a.commit(view)).toEqual([
      { type: "exploit", tile: "0,0" },
      { type: "bid", energy: 9 }, // operator's standing bid wins
    ]);
  });

  it("rides along with a queued-orders override and with manual Ready", async () => {
    const store = new SteeringStore();
    store.update("cog0", { standingBid: 4, pending: [{ type: "exploit", tile: "0,0" }] });
    const a = steerableAgent({ id: "cog0", commit: () => [] }, store);
    expect(await a.commit(view)).toEqual([
      { type: "exploit", tile: "0,0" },
      { type: "bid", energy: 4 },
    ]);
    // manual Ready path
    store.update("cog0", { paused: true, pending: [{ type: "abandon", tile: "1,0" }] });
    const orders = a.commit(view) as Promise<unknown>;
    store.markReady("cog0");
    expect(await orders).toEqual([
      { type: "abandon", tile: "1,0" },
      { type: "bid", energy: 4 },
    ]);
  });

  it("at 0, the agent's own bid stands", async () => {
    const store = new SteeringStore();
    const a = steerableAgent({ id: "cog0", commit: () => [{ type: "bid", energy: 2 }] }, store);
    expect(await a.commit(view)).toEqual([{ type: "bid", energy: 2 }]);
  });
});

describe("steerableAgent", () => {
  const view = { state: {} as never, me: "cog0" as const };
  const base: Agent = { id: "cog0", commit: () => [{ type: "bid", energy: 7 }], negotiate: () => [{ to: "public", text: "hi" }] };

  it("delegates when not paused and no queue", async () => {
    const store = new SteeringStore();
    const a = steerableAgent(base, store);
    expect(await a.commit(view)).toEqual([{ type: "bid", energy: 7 }]);
    expect(a.negotiate!(view)).toEqual([{ to: "public", text: "hi" }]);
  });

  it("a MANUAL cog waits during Commit until the operator hits Ready (queue submits then)", async () => {
    const store = new SteeringStore();
    store.update("cog0", { paused: true, pending: [{ type: "align", tile: "1,0", force: 3 }] });
    let called = false;
    const spy: Agent = { id: "cog0", commit: () => ((called = true), [{ type: "bid", energy: 7 }]), negotiate: () => ((called = true), []) };
    const a = steerableAgent(spy, store);
    expect(a.negotiate!(view)).toEqual([]); // silent in Negotiate
    const orders = a.commit(view) as Promise<unknown>;
    let resolved = false;
    void orders.then(() => (resolved = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false); // parked — waiting for the operator
    store.markReady("cog0");
    expect(await orders).toEqual([{ type: "align", tile: "1,0", force: 3 }]);
    expect(called).toBe(false); // the model was never invoked
    expect(store.get("cog0").pending).toEqual([]); // consumed
  });

  it("Ready BEFORE the commit window arms it: the next commit submits immediately", async () => {
    const store = new SteeringStore();
    store.update("cog0", { paused: true, pending: [{ type: "exploit", tile: "0,0" }] });
    store.markReady("cog0"); // negotiate phase, say
    const a = steerableAgent({ id: "cog0", commit: () => [] }, store);
    expect(await a.commit(view)).toEqual([{ type: "exploit", tile: "0,0" }]);
  });

  it("Ready with an empty queue is an explicit hold ([])", async () => {
    const store = new SteeringStore();
    store.update("cog0", { paused: true });
    const a = steerableAgent({ id: "cog0", commit: () => [{ type: "bid", energy: 7 }] }, store);
    const orders = a.commit(view) as Promise<unknown>;
    store.markReady("cog0");
    expect(await orders).toEqual([]);
  });

  it("re-enabling autopilot mid-Commit executes the agent immediately", async () => {
    const store = new SteeringStore();
    store.update("cog0", { paused: true });
    let calls = 0;
    const spy: Agent = { id: "cog0", commit: () => (calls++, [{ type: "bid", energy: 7 }]) };
    const a = steerableAgent(spy, store);
    const orders = a.commit(view) as Promise<unknown>; // parked, waiting for the operator
    store.update("cog0", { paused: false }); // operator flips Auto Pilot back ON
    expect(await orders).toEqual([{ type: "bid", energy: 7 }]); // the agent played this turn
    expect(calls).toBe(1);
  });

  it("re-enabling autopilot mid-Commit submits the staged queue over the agent", async () => {
    const store = new SteeringStore();
    store.update("cog0", { paused: true, pending: [{ type: "exploit", tile: "0,0" }] });
    const a = steerableAgent({ id: "cog0", commit: () => [{ type: "bid", energy: 7 }] }, store);
    const orders = a.commit(view) as Promise<unknown>;
    store.update("cog0", { paused: false });
    expect(await orders).toEqual([{ type: "exploit", tile: "0,0" }]); // the queue still wins
    expect(store.get("cog0").pending).toEqual([]);
  });

  it("on AUTOPILOT, queued operator orders override the agent's commit and submit once", async () => {
    const store = new SteeringStore();
    store.update("cog0", { pending: [{ type: "align", tile: "1,0", force: 3 }] });
    let calls = 0;
    const spy: Agent = { id: "cog0", commit: () => (calls++, [{ type: "bid", energy: 7 }]) };
    const a = steerableAgent(spy, store);
    expect(await a.commit(view)).toEqual([{ type: "align", tile: "1,0", force: 3 }]); // queue wins
    expect(calls).toBe(0);
    expect(await a.commit(view)).toEqual([{ type: "bid", energy: 7 }]); // consumed; agent resumes
  });

  it("preserves an absent negotiate hook", () => {
    const store = new SteeringStore();
    const a = steerableAgent({ id: "cog0", commit: () => [] }, store);
    expect(a.negotiate).toBeUndefined();
  });
});
