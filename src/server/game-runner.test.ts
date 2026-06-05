import { describe, it, expect } from "vitest";
import { GameRunner } from "./game-runner";
import { greedyAgent, peacefulAgent } from "../agents/stub";
import type { ServerMessage } from "../shared/protocol";

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
});
