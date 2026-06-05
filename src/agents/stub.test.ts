import { describe, it, expect } from "vitest";
import { peacefulAgent, greedyAgent, randomAgent } from "./stub";
import { runGame } from "../engine/game";
import { isLegalAlignTarget, isOwn } from "../engine/orders";
import { maxEnergy } from "../engine/energy";
import type { GameState, Tile, CogId, Treasury, CogState } from "../engine/types";
import { key } from "../engine/hex";

const tile = (q: number, r: number, alignment: CogId | null, coherence: number, mineral: any = "C", density = 1): Tile =>
  ({ hex: { q, r }, alignment, coherence, mineral, density });
const T = (C = 0, O = 0, Ge = 0, S = 0): Treasury => ({ C, O, Ge, S });
const stateWith = (tiles: Tile[], cogOrder: CogId[], treasuries: Record<CogId, Treasury> = {}): GameState => {
  const map: Record<string, Tile> = {};
  for (const t of tiles) map[key(t.hex)] = t;
  const cogs: Record<CogId, CogState> = {};
  cogOrder.forEach((id, i) => (cogs[id] = { id, index: i, treasury: treasuries[id] ?? T(), hearts: 0 }));
  return { turn: 1, phase: "commit", seed: 0, tiles: map, cogs, cogOrder, log: [] };
};

describe("stub agents", () => {
  it("peacefulAgent claims neutral land or reinforces, never targets an enemy tile", () => {
    const s = stateWith([tile(0, 0, "A", 3), tile(0, 1, null, 0), tile(1, 0, "B", 2)], ["A", "B"], { A: T(1, 1, 1, 1) });
    const orders = peacefulAgent("A").commit({ state: s, me: "A" });
    expect(orders).toHaveLength(1);
    const o = orders[0]!;
    expect(o.type).toBe("align");
    if (o.type === "align") expect(o.tile).not.toBe("1,0"); // never the enemy tile
  });

  it("greedyAgent pushes into the weakest adjacent tile (here an enemy) and bids", () => {
    const s = stateWith([tile(0, 0, "A", 3), tile(1, 0, "B", 1)], ["A", "B"], { A: T(2, 2, 2, 2) });
    const orders = greedyAgent("A").commit({ state: s, me: "A" });
    expect(orders.some((o) => o.type === "align" && o.tile === "1,0")).toBe(true);
    expect(orders.some((o) => o.type === "bid")).toBe(true);
  });

  it("randomAgent only emits legal, affordable orders", () => {
    const s = stateWith([tile(0, 0, "A", 3), tile(0, 1, null, 0), tile(1, 0, "B", 2)], ["A", "B"], { A: T(1, 1, 1, 1) });
    const agent = randomAgent("A", 42);
    const e = maxEnergy(s.cogs.A!.treasury);
    for (let i = 0; i < 50; i++) {
      for (const o of agent.commit({ state: s, me: "A" })) {
        if (o.type === "align") {
          expect(isLegalAlignTarget(s, "A", o.tile)).toBe(true);
          expect(o.energy).toBeLessThanOrEqual(e);
        } else if (o.type === "exploit") {
          expect(isOwn(s, "A", o.tile)).toBe(true);
        } else if (o.type === "bid") {
          expect(o.energy).toBeLessThanOrEqual(e);
        }
      }
    }
  });

  it("a 4-stub game completes 100 turns and yields a winner (deterministic with fresh agents)", () => {
    const makeAgents = () => [greedyAgent("cog0"), peacefulAgent("cog1"), randomAgent("cog2", 1), greedyAgent("cog3")];
    const a = runGame(7, 4, makeAgents());
    const b = runGame(7, 4, makeAgents());
    expect(a.state.turn).toBe(101);
    expect(a.state.log).toHaveLength(100);
    expect(a.winner).not.toBeNull();
    expect(a.winner).toBe(b.winner);
  });
});
