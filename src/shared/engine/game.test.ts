import { describe, it, expect } from "vitest";
import { newGame, stepTurn, runGame, scoreGame } from "./game";
import type { Agent } from "../../agents/types";
import type { CogId, Treasury } from "./types";
import { FIRST_COMMIT_REWARD } from "./constants";

const noop = (id: CogId): Agent => ({ id, commit: () => [] });

describe("game", () => {
  it("newGame starts at turn 1, negotiate phase, 127 tiles, n cogs", () => {
    const g = newGame(7, 4);
    expect(g.turn).toBe(1);
    expect(g.phase).toBe("negotiate");
    expect(Object.keys(g.tiles)).toHaveLength(127);
    expect(g.cogOrder).toEqual(["cog0", "cog1", "cog2", "cog3"]);
  });

  it("stepTurn advances the turn, returns to negotiate, and appends one TurnRecord", () => {
    const g2 = stepTurn(newGame(7, 4), {});
    expect(g2.turn).toBe(2);
    expect(g2.phase).toBe("negotiate");
    expect(g2.log).toHaveLength(1);
    expect(g2.log[0]!.turn).toBe(1);
    expect(g2.log[0]!.hearts).toHaveProperty("cog0");
  });

  it("stepTurn does not mutate the input state", () => {
    const g = newGame(7, 4);
    stepTurn(g, {});
    expect(g.turn).toBe(1);
    expect(g.log).toHaveLength(0);
  });

  it("awards the first committer the tempo bonus and logs a firstCommit event", () => {
    const g = newGame(7, 4);
    const without = stepTurn(g, {});
    const withFirst = stepTurn(g, {}, ["cog1"]);
    // cog1's stored energy is FIRST_COMMIT_REWARD richer than if it hadn't moved first.
    expect(withFirst.cogs.cog1!.energy).toBe(without.cogs.cog1!.energy + FIRST_COMMIT_REWARD);
    expect(withFirst.log[0]!.events.find((e) => e.type === "firstCommit")).toMatchObject({
      cog: "cog1",
      reward: FIRST_COMMIT_REWARD,
    });
  });

  it("no first committer -> no bonus, no event (scripted replays opt out)", () => {
    const g2 = stepTurn(newGame(7, 4), {});
    expect(g2.log[0]!.events.some((e) => e.type === "firstCommit")).toBe(false);
  });

  it("records every order as played, ahead of its consequences (for the Turn Log)", () => {
    const g = newGame(7, 4);
    const next = stepTurn(g, { cog0: [{ type: "bid", energy: 3 }], cog2: [{ type: "bid", energy: 1 }] });
    const events = next.log[0]!.events;
    expect(events[0]).toEqual({ type: "order", cog: "cog0", order: { type: "bid", energy: 3 } });
    expect(events[1]).toEqual({ type: "order", cog: "cog2", order: { type: "bid", energy: 1 } });
    expect(events.findIndex((e) => e.type === "auction")).toBeGreaterThan(1);
  });

  it("runGame plays MAX_TURNS turns, returns a winner, and is fully deterministic for (seed, agents)", async () => {
    const agents = ["cog0", "cog1", "cog2", "cog3"].map(noop);
    const a = await runGame(7, 4, agents);
    const b = await runGame(7, 4, agents);
    expect(a.state.turn).toBe(101);
    expect(a.state.log).toHaveLength(100);
    expect(a.winner).not.toBeNull();
    expect(a.state).toEqual(b.state);
    expect(a.winner).toBe(b.winner);
  });

  it("scoreGame ranks by hearts, then maxEnergy, then index", () => {
    const g = newGame(7, 3);
    g.cogs.cog0!.hearts = 2;
    g.cogs.cog1!.hearts = 5;
    g.cogs.cog2!.hearts = 5; // tie with cog1 on hearts
    g.cogs.cog1!.treasury = { C: 0, O: 0, Ge: 0, S: 0 };
    g.cogs.cog2!.treasury = { C: 2, O: 2, Ge: 2, S: 2 }; // higher maxEnergy breaks the tie
    const { winner, standings } = scoreGame(g);
    expect(winner).toBe("cog2");
    expect(standings[0]).toEqual({ cog: "cog2", hearts: 5 });
    expect(standings[2]).toEqual({ cog: "cog0", hearts: 2 });
  });

  it("accumulates one log record per turn without mutating earlier records", () => {
    let g = newGame(7, 4);
    g = stepTurn(g, {});
    const firstRecord = g.log[0];
    g = stepTurn(g, {});
    expect(g.log).toHaveLength(2);
    expect(g.log[0]!.turn).toBe(1);
    expect(g.log[1]!.turn).toBe(2);
    expect(g.log[0]).toBe(firstRecord); // earlier record is the same object (append, not in-place mutation)
  });

  it("scoreGame breaks a full hearts+maxEnergy tie by lowest index", () => {
    const g = newGame(7, 3); // all cogs start with 0 hearts and identical wallets -> fully tied
    expect(scoreGame(g).winner).toBe("cog0");
  });
});
