import { describe, it, expect } from "vitest";
import { parseReplay, snapshots } from "./replay-source";
import { makeReplay } from "../shared/replay";
import { greedyAgent, peacefulAgent } from "../agents/stub";

const replay = () => makeReplay(7, ["greedy", "peaceful"], [greedyAgent("cog0"), peacefulAgent("cog1")]);

describe("replay-source", () => {
  it("parses + validates a replay object", async () => {
    const r = parseReplay(JSON.parse(JSON.stringify(await replay())));
    expect(r.meta.seed).toBe(7);
  });
  it("throws on a malformed frame", () =>
    expect(() =>
      parseReplay({ meta: { version: "x", seed: 1, agents: [], turns: 1 }, frames: [{ type: "bogus" }] }),
    ).toThrow());
  it("extracts the ordered snapshot list", async () => {
    const snaps = snapshots(parseReplay(await replay()));
    expect(snaps.length).toBeGreaterThan(1);
    expect(snaps[0]!.turn).toBe(1);
  });
});
