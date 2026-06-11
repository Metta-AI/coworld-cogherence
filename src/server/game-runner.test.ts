import { describe, it, expect } from "vitest";
import { GameRunner } from "./game-runner";
import { greedyAgent, peacefulAgent } from "../agents/stub";
import { MessageBus } from "./message-bus";
import { SteeringStore, steerableAgent } from "./steering-store";
import type { ServerMessage } from "../shared/protocol";
import type { Order } from "../shared/engine/orders";
import type { Agent } from "../agents/types";

describe("GameRunner", () => {
  it("runs a scripted game to completion and emits frames", async () => {
    const runner = new GameRunner({
      seed: 7,
      agents: [greedyAgent("cog0"), peacefulAgent("cog1")],
      maxTurns: 3,
      deadlineMs: 50,
    });
    const frames: ServerMessage[] = [];
    runner.onUpdate((m) => frames.push(m));
    await runner.run();
    expect(frames.some((f) => f.type === "snapshot")).toBe(true);
    expect(frames.at(-1)!.type).toBe("serverStatus");
    expect(runner.state.turn).toBe(4); // 3 turns played
  });

  it("surfaces a distinct 'auction' phase in the live turn sequence", async () => {
    const runner = new GameRunner({
      seed: 7,
      agents: [greedyAgent("cog0"), peacefulAgent("cog1")],
      maxTurns: 2,
      deadlineMs: 50,
    });
    const phases: string[] = [];
    runner.onUpdate((m) => {
      if (m.type === "serverStatus") phases.push(m.status.phase);
    });
    await runner.run();
    expect(phases).toContain("auction"); // the heart settles in its own phase
    expect(phases).toContain("commit"); // …after commit, before the next turn
  });

  it("returns a winner after auto-driving in-process agents", async () => {
    const runner = new GameRunner({
      seed: 7,
      agents: [greedyAgent("cog0"), greedyAgent("cog1")],
      maxTurns: 2,
      deadlineMs: 50,
    });
    const result = await runner.run();
    expect(["cog0", "cog1", null]).toContain(result.winner);
  });

  it("reset() restarts the game from turn 1 and re-broadcasts a fresh snapshot", async () => {
    const bus = new MessageBus();
    const runner = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 2, deadlineMs: 50, bus });
    await runner.run();
    expect(runner.state.turn).toBe(3); // finished a 2-turn game
    bus.post("cog0", "public", "stale chatter", 1);

    const frames: ServerMessage[] = [];
    runner.onUpdate((m) => frames.push(m));
    runner.reset();
    await new Promise((r) => setTimeout(r, 120)); // let the fresh loop play out

    expect(bus.recent().some((m) => m.text === "stale chatter")).toBe(false); // abandoned game's chat cleared
    const firstSnap = frames.find((f) => f.type === "snapshot");
    expect(firstSnap && firstSnap.type === "snapshot" && firstSnap.snapshot.turn).toBe(1); // re-broadcast from turn 1
    expect(runner.recentEvents().every((e) => e.turn <= 2)).toBe(true); // only the new game's events
  });

  it("a hung commit can't stall the turn — the deadline defaults it to []", async () => {
    // a manual cog that never hits Ready parks its commit promise forever; the
    // turn must still advance at the deadline (the loop must not await it).
    const hung: Agent = { id: "cog0", commit: () => new Promise<never>(() => {}) };
    const quiet: Agent = { id: "cog1", commit: () => [] };
    const runner = new GameRunner({ seed: 7, agents: [hung, quiet], maxTurns: 2, deadlineMs: 30 });
    await runner.run();
    expect(runner.state.turn).toBe(3); // 2 turns played despite the parked commit
  });

  it("waitForReady: the commit window has no deadline — the turn waits for every cog", async () => {
    let release!: (o: Order[]) => void;
    const slow: Agent = { id: "cog0", commit: () => new Promise<Order[]>((r) => (release = r)) };
    const quick: Agent = { id: "cog1", commit: () => [] };
    const runner = new GameRunner({ seed: 7, agents: [slow, quick], maxTurns: 1, deadlineMs: 30, waitForReady: true });
    const done = runner.run();
    await new Promise((r) => setTimeout(r, 120)); // far past the 30ms deadline
    expect(runner.state.turn).toBe(1); // still parked on cog0's commit
    release([]);
    await done;
    expect(runner.state.turn).toBe(2); // advanced only once everyone submitted
  });

  it("setWaitForReady(false) releases a parked commit window — the turn defaults and moves on", async () => {
    const hung: Agent = { id: "cog0", commit: () => new Promise<never>(() => {}) };
    const quick: Agent = { id: "cog1", commit: () => [] };
    const runner = new GameRunner({ seed: 7, agents: [hung, quick], maxTurns: 1, deadlineMs: 30, waitForReady: true });
    const done = runner.run();
    await new Promise((r) => setTimeout(r, 80));
    expect(runner.state.turn).toBe(1); // parked on cog0, far past the would-be deadline
    runner.setWaitForReady(false); // flips the mode AND expires the stuck window
    await done;
    expect(runner.state.turn).toBe(2);
  });

  it("an empty board idles at turn 1; the first addCog wakes it and the game runs", async () => {
    const runner = new GameRunner({ seed: 7, agents: [], maxTurns: 2, deadlineMs: 30 });
    const done = runner.run();
    await new Promise((r) => setTimeout(r, 80));
    expect(runner.state.turn).toBe(1); // idling — zero cogs, nothing simulated
    runner.addCog((id) => greedyAgent(id));
    const result = await done; // greedy plays both turns to completion
    expect(runner.state.turn).toBe(3);
    expect(result.standings).toHaveLength(1);
  });

  it("reset keeps claimed names — the roster survives a clean-board restart", () => {
    const runner = new GameRunner({ seed: 7, agents: [], maxTurns: 2, deadlineMs: 30 });
    runner.addCog((id) => greedyAgent(id), "zoe");
    runner.reset();
    expect(runner.state.cogs.cog0!.name).toBe("zoe");
  });

  it("auto-convert: a paused cog with the flag converts its sets at turn start; without it, sets sit", async () => {
    const run = async (autoConvert: boolean) => {
      const steering = new SteeringStore();
      steering.update("cog0", { paused: true, autoConvert });
      const runner = new GameRunner({ seed: 7, agents: [steerableAgent(greedyAgent("cog0"), steering)], maxTurns: 1, deadlineMs: 30, steering });
      runner.state = { ...runner.state, cogs: { ...runner.state.cogs, cog0: { ...runner.state.cogs.cog0!, treasury: { C: 2, O: 1, Ge: 1, S: 1 } } } };
      await runner.run();
      return runner.state.cogs.cog0!;
    };
    const withAuto = await run(true);
    expect(withAuto.energy).toBe(109); // 100 + 10 converted − 1 upkeep
    expect(withAuto.treasury.O).toBe(0); // the set burned
    const without = await run(false);
    expect(without.energy).toBe(99); // 100 − 1 upkeep; manual cogs keep their sets
    expect(without.treasury.O).toBe(1);
  });

  it("a hung negotiate can't stall the turn — it's raced against the deadline", async () => {
    const bus = new MessageBus();
    const hung: Agent = { id: "cog0", commit: () => [], negotiate: () => new Promise<never>(() => {}) }; // never resolves
    const quiet: Agent = { id: "cog1", commit: () => [] };
    const runner = new GameRunner({ seed: 7, agents: [hung, quiet], maxTurns: 2, deadlineMs: 30, bus });
    const result = await runner.run(); // completes despite the hung negotiate (would hang forever without the race)
    expect(runner.state.turn).toBe(3); // 2 turns played
    expect(["cog0", "cog1", null]).toContain(result.winner);
  });

  it("pause parks the turn loop; resume lets it continue; status reflects it", async () => {
    const runner = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 6, deadlineMs: 10, minTurnMs: 5 });
    runner.setPaused(true); // park before the first turn even starts
    void runner.run();
    await new Promise((r) => setTimeout(r, 60));
    const parked = runner.state.turn;
    expect(runner.currentStatus().paused).toBe(true);
    expect(typeof runner.currentStatus().pausedAt).toBe("number"); // game clock frozen at this epoch

    await new Promise((r) => setTimeout(r, 60));
    expect(runner.state.turn).toBe(parked); // no advance while paused

    runner.setPaused(false);
    const resumed = runner.currentStatus();
    expect(resumed.paused).toBe(false);
    expect(resumed.pausedAt).toBeUndefined(); // clock running again
    expect(resumed.pausedAccumMs ?? 0).toBeGreaterThanOrEqual(0); // paused time accumulated
    await new Promise((r) => setTimeout(r, 150)); // let the (short) game play out
    expect(runner.state.turn).toBeGreaterThan(parked); // advanced after resume
  });

  it("auto-stops (pauses) at the soft turn limit; extendTurnLimit adds turns and resumes", async () => {
    const runner = new GameRunner({
      seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 20, deadlineMs: 10, minTurnMs: 1, turnLimit: 2,
    });
    void runner.run();
    await new Promise((r) => setTimeout(r, 250));
    expect(runner.state.turn).toBe(3); // turns 1-2 played, parked before turn 3
    expect(runner.currentStatus().paused).toBe(true);
    expect(runner.currentStatus().turnLimit).toBe(2);

    runner.setPaused(false); // resuming WITHOUT extending re-parks at the limit
    await new Promise((r) => setTimeout(r, 80));
    expect(runner.state.turn).toBe(3);
    expect(runner.currentStatus().paused).toBe(true);

    expect(runner.extendTurnLimit(10)).toBe(12); // +10 and resumes
    await new Promise((r) => setTimeout(r, 400));
    expect(runner.state.turn).toBeGreaterThan(3);
  });

  it("runs a negotiate round: agents post to the bus, others stay silent", async () => {
    const chatty: Agent = { id: "cog0", commit: () => [], negotiate: () => [{ to: "public", text: "hello all" }] };
    const quiet: Agent = { id: "cog1", commit: () => [] };
    const bus = new MessageBus();
    const posted: string[] = [];
    bus.onPost((m) => posted.push(`${m.from}:${m.text}`));
    const runner = new GameRunner({ seed: 7, agents: [chatty, quiet], maxTurns: 2, deadlineMs: 50, bus });
    await runner.run();
    expect(posted).toContain("cog0:hello all");
    expect(posted.every((p) => p.startsWith("cog0:"))).toBe(true); // quiet cog posted nothing
  });
});
