import { describe, it, expect } from "vitest";
import { parseArgs, buildAgents, playGame, summarize, replayFromOpts } from "./cli";

describe("cli", () => {
  it("parseArgs reads seed and agents, with defaults", () => {
    const o = parseArgs(["--seed", "9", "--agents", "greedy,peaceful"]);
    expect(o.seed).toBe(9);
    expect(o.agents).toEqual(["greedy", "peaceful"]);
    const d = parseArgs([]);
    expect(d.seed).toBe(7);
    expect(d.agents).toHaveLength(4);
  });

  it("parseArgs --cogs N (without --agents) builds N agents from the default rotation", () => {
    expect(parseArgs(["--cogs", "3"]).agents).toHaveLength(3);
  });

  it("parseArgs reads --out and clamps --every to >= 1", () => {
    expect(parseArgs(["--out", "game.json"]).out).toBe("game.json");
    expect(parseArgs(["--every", "0"]).every).toBe(1);
  });

  it("buildAgents maps specs to agents with cog ids", () => {
    expect(buildAgents(["greedy", "peaceful", "random"], 7).map((a) => a.id)).toEqual(["cog0", "cog1", "cog2"]);
  });

  it("buildAgents throws on an unknown agent type", () => {
    expect(() => buildAgents(["frobnicate"], 7)).toThrow();
  });

  it("playGame runs a full game and returns a winner with a 100-turn log", async () => {
    const r = await playGame({ seed: 7, agents: ["greedy", "peaceful", "random", "greedy"] });
    expect(r.state.log).toHaveLength(100);
    expect(r.winner).not.toBeNull();
  });

  it("summarize ends with a winner line and includes sampled turns", async () => {
    const r = await playGame({ seed: 7, agents: ["greedy", "peaceful", "random", "greedy"] });
    const lines = summarize(r, 25);
    expect(lines.at(-1)).toContain("winner:");
    expect(lines.length).toBeGreaterThan(1);
  });

  it("summarize samples turn 1 and every Nth turn, then the winner line", async () => {
    const r = await playGame({ seed: 7, agents: ["greedy", "peaceful", "random", "greedy"] });
    const lines = summarize(r, 25); // turns 1, 25, 50, 75, 100 + winner = 6 lines
    expect(lines).toHaveLength(6);
    expect(lines[0]).toContain("turn   1");
    expect(lines.at(-1)).toContain("winner:");
  });

  it("replayFromOpts builds a meta-stamped replay with frames", async () => {
    const r = await replayFromOpts({ seed: 7, agents: ["greedy", "peaceful"] });
    expect(r.meta.seed).toBe(7);
    expect(r.frames.length).toBeGreaterThan(0);
    expect(r.frames[0]!.type).toBe("snapshot");
  });
});
