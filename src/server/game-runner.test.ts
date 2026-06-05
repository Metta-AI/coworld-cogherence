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
