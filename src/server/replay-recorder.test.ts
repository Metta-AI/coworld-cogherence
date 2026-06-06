import { describe, it, expect } from "vitest";
import { ReplayRecorder } from "./replay-recorder";
import { GameRunner } from "./game-runner";
import { MessageBus } from "./message-bus";
import { greedyAgent } from "../agents/stub";
import { parseReplay } from "../client/replay-source";

const makeRunner = (bus?: MessageBus) =>
  new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 3, deadlineMs: 30, bus });

describe("ReplayRecorder", () => {
  it("is empty before anything runs, then captures the global frame stream", async () => {
    const runner = makeRunner();
    const rec = new ReplayRecorder(runner, { seed: 7, agents: ["greedy", "greedy"], turns: 3 });
    expect(rec.isEmpty).toBe(true);
    await runner.run();
    expect(rec.isEmpty).toBe(false);
    const doc = rec.doc();
    expect(doc.frames.filter((f) => f.type === "snapshot").length).toBeGreaterThanOrEqual(4); // initial + 3 turns
    expect(doc.frames.some((f) => f.type === "event")).toBe(true);
  });

  it("captures chat from the bus and produces a doc that parseReplay accepts", async () => {
    const bus = new MessageBus();
    const runner = makeRunner(bus);
    const rec = new ReplayRecorder(runner, { seed: 7, agents: ["greedy", "greedy"], turns: 3 }, { bus });
    await runner.run();
    const doc = rec.doc();
    expect(doc.frames.some((f) => f.type === "message")).toBe(true); // greedy agents negotiate
    expect(() => parseReplay(doc)).not.toThrow(); // valid replay envelope -> client can load it
    expect(parseReplay(doc).meta.agents).toEqual(["greedy", "greedy"]);
  });

  it("drops the abandoned game on reset (snapshot turn moves backwards)", async () => {
    const runner = makeRunner();
    const rec = new ReplayRecorder(runner, { seed: 7, agents: ["greedy", "greedy"], turns: 3 });
    await runner.run();
    const beforeMax = Math.max(...rec.doc().frames.flatMap((f) => (f.type === "snapshot" ? [f.snapshot.turn] : [])));
    expect(beforeMax).toBe(4);
    runner.reset();
    await new Promise((r) => setTimeout(r, 120));
    const turns = rec.doc().frames.flatMap((f) => (f.type === "snapshot" ? [f.snapshot.turn] : []));
    expect(Math.min(...turns)).toBe(1); // fresh recording starts at turn 1
    expect(turns.filter((t) => t === 1)).toHaveLength(1); // exactly one turn-1 snapshot (old game dropped)
  });
});
