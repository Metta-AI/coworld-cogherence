import { describe, it, expect } from "vitest";
import { recordGame, makeReplay } from "./replay";
import { greedyAgent, peacefulAgent } from "../agents/stub";
import { serverMessageSchema } from "./protocol";
import { runGame } from "./engine/game";
import { toSnapshot } from "./snapshot";
import { MAX_TURNS } from "./engine/constants";

const agents = () => [greedyAgent("cog0"), peacefulAgent("cog1")];

describe("recordGame", () => {
  it("emits an initial snapshot + one per turn (MAX_TURNS+1)", () => {
    const snaps = recordGame(7, agents()).filter((f) => f.type === "snapshot");
    expect(snaps).toHaveLength(MAX_TURNS + 1);
  });
  it("every frame validates against the protocol", () => {
    for (const f of recordGame(7, agents())) expect(() => serverMessageSchema.parse(f)).not.toThrow();
  });
  it("last snapshot equals the engine's final state", () => {
    const frames = recordGame(7, agents());
    const last = [...frames].reverse().find((f) => f.type === "snapshot")!;
    const final = runGame(7, 2, agents());
    expect(last.type === "snapshot" && last.snapshot).toEqual(toSnapshot(final.state));
  });
  it("is deterministic for (seed, agents)", () =>
    expect(recordGame(7, agents())).toEqual(recordGame(7, agents())));
});

describe("makeReplay", () => {
  it("wraps frames with meta", () => {
    const r = makeReplay(7, ["greedy", "peaceful"], agents());
    expect(r.meta.seed).toBe(7);
    expect(r.meta.agents).toEqual(["greedy", "peaceful"]);
    expect(r.frames.length).toBeGreaterThan(0);
  });
});
