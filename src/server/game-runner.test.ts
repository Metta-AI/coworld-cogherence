import { describe, it, expect } from "vitest";
import { GameRunner } from "./game-runner";
import { greedyAgent, peacefulAgent } from "../agents/stub";
import { MessageBus } from "./message-bus";
import type { ServerMessage } from "../shared/protocol";
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

  it("a hung negotiate can't stall the turn — it's raced against the deadline", async () => {
    const bus = new MessageBus();
    const hung: Agent = { id: "cog0", commit: () => [], negotiate: () => new Promise<never>(() => {}) }; // never resolves
    const quiet: Agent = { id: "cog1", commit: () => [] };
    const runner = new GameRunner({ seed: 7, agents: [hung, quiet], maxTurns: 2, deadlineMs: 30, bus });
    const result = await runner.run(); // completes despite the hung negotiate (would hang forever without the race)
    expect(runner.state.turn).toBe(3); // 2 turns played
    expect(["cog0", "cog1", null]).toContain(result.winner);
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
