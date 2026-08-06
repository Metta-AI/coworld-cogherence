// SEAM-VALIDATION proof: a fixed scripted strategy driven through BOTH the pure
// engine `runGame` and the @cogweb/core Game-seam adapter must yield byte-for-byte
// identical engine states, across several seeds and player counts, for N turns.
// The seam buffers each seat's Order[] and runs the SAME `stepTurn` when the last
// seat submits — so if the adapter is faithful, the two trajectories cannot drift.
//
// A second test proves the validate-then-apply gate: `applyDecision` throws
// GameError on an order set the engine would reject.

import { describe, it, expect } from "vitest";
import { GameError } from "@cogweb/core";
import { runGame } from "../shared/engine/game.js";
import { makeRng } from "../shared/engine/rng.js";
import { distance } from "../shared/engine/hex.js";
import type { Agent, AgentView } from "../agents/types.js";
import type { Order } from "../shared/engine/orders.js";
import type { GameState, CogId } from "../shared/engine/types.js";
import { cogherenceGame, type CoghereSeamState } from "./game.js";

const TURNS = 12; // far short of MAX_TURNS (100) — enough to exercise drift.

// A deterministic, ALWAYS-LEGAL, ALWAYS-AFFORDABLE policy keyed by
// (seed, turn, cog). Cogs start with 100 stored energy; a force-1 align on an OWN
// tile costs exactly 1e (force² + distance² = 1 + 0) and a small bid is well
// within budget — so the engine accepts every set and BOTH paths step identically.
// (An order set the seam rejects would never reach stepTurn, so parity requires a
// strategy the engine accepts; legality is proven separately below.)
function scriptedOrders(seed: number, state: GameState, me: CogId): Order[] {
  const cog = state.cogs[me]!;
  const rng = makeRng(seed * 1_000_003 + state.turn * 131 + cog.index);
  const roll = rng();
  if (roll < 0.34) return []; // hold
  const orders: Order[] = [];
  // align an own tile at force 1 (cost 1e, distance 0) — always legal + affordable
  const own = Object.keys(state.tiles).find((k) => state.tiles[k]!.alignment === me);
  if (own && roll < 0.7) orders.push({ type: "align", tile: own, force: 1 });
  // a modest sealed bid the cog can always cover from its 100 starting energy
  if (roll >= 0.5) orders.push({ type: "bid", energy: 1 + Math.floor(rng() * 5) });
  return orders;
}

function scriptedAgents(seed: number, numCogs: number): Agent[] {
  return Array.from({ length: numCogs }, (_, i) => {
    const id = `cog${i}`;
    return { id, commit: (view: AgentView) => scriptedOrders(seed, view.state, view.me) };
  });
}

/** Drive the SAME scripted policy through the seam adapter, feeding each seat's
 *  Order[] via applyDecision in seat order; the last submission resolves the turn.
 *  Returns the final engine GameState after `turns` resolved turns. */
function driveSeam(seed: number, numCogs: number, turns: number): GameState {
  let s: CoghereSeamState = cogherenceGame.newGame({
    seed: String(seed),
    playerCount: numCogs,
    seatNames: [],
  });
  for (let t = 0; t < turns; t++) {
    const snapshot = s.engine; // all seats decide off the SAME pre-turn state, like runGame
    for (let seat = 0; seat < numCogs; seat++) {
      const id = `cog${seat}`;
      const orders = scriptedOrders(seed, snapshot, id);
      s = cogherenceGame.applyDecision(s, seat, { orders }).state;
    }
  }
  return s.engine;
}

const CONFIGS: Array<{ seed: number; cogs: number }> = [
  { seed: 1, cogs: 3 },
  { seed: 2, cogs: 3 },
  { seed: 7, cogs: 4 },
  { seed: 13, cogs: 4 },
  { seed: 21, cogs: 6 },
  { seed: 99, cogs: 6 },
];

describe("cogherence on the @cogweb/core seam", () => {
  for (const { seed, cogs } of CONFIGS) {
    it(`is byte-for-byte identical to runGame (seed ${seed}, ${cogs} cogs, ${TURNS} turns)`, async () => {
      const engineResult = await runGame(seed, cogs, scriptedAgents(seed, cogs), TURNS);
      const seamFinal = driveSeam(seed, cogs, TURNS);

      // The pure-engine trajectory and the seam trajectory must match exactly.
      expect(JSON.stringify(seamFinal)).toBe(JSON.stringify(engineResult.state));
      // Sanity: the run actually advanced (turn = TURNS + 1 after TURNS steps).
      expect(seamFinal.turn).toBe(TURNS + 1);
      // Hearts were auctioned: at most one per turn, so total ≤ TURNS.
      const hearts = Object.values(seamFinal.cogs).reduce((a, c) => a + c.hearts, 0);
      expect(hearts).toBeLessThanOrEqual(TURNS);
    });
  }

  it("score() matches the engine's per-seat hearts", async () => {
    const seed = 7;
    const cogs = 4;
    const engineResult = await runGame(seed, cogs, scriptedAgents(seed, cogs), TURNS);
    const seamFinal = driveSeam(seed, cogs, TURNS);
    // Build a fresh seam state holding the seam's final engine to read score().
    const score = cogherenceGame.score({ engine: seamFinal, pending: [], orders: {}, committedOrder: [] });
    for (const id of engineResult.state.cogOrder) {
      const c = engineResult.state.cogs[id]!;
      expect(score[c.index]).toBe(c.hearts);
    }
    // Non-vacuity: the scripted policy actually moves state — hearts get auctioned
    // and treasuries mint — so the byte-for-byte equality above is a real proof,
    // not two identical no-op trajectories.
    const totalHearts = Object.values(seamFinal.cogs).reduce((a, c) => a + c.hearts, 0);
    expect(totalHearts).toBeGreaterThan(0);
    const anyMinerals = Object.values(seamFinal.cogs).some(
      (c) => c.treasury.C + c.treasury.O + c.treasury.Ge + c.treasury.S > 0,
    );
    expect(anyMinerals).toBe(true);
  });

  it("rejects an illegal order set through the validate-then-apply gate", () => {
    const s = cogherenceGame.newGame({ seed: "0", playerCount: 4, seatNames: [] });

    // (a) An out-of-reach align: force 10 at a tile far from cog0's home bills
    //     force²+distance² (≥100 + distance²) past ALIGN_MAX_ENERGY (100e), so the
    //     engine rejects the whole set. cog0 holds its home corner, so the align
    //     target is legal — it's the COST that bounces it.
    const homeHex = Object.values(s.engine.tiles).find((t) => t.alignment === "cog0")!.hex;
    const farNeutral = Object.entries(s.engine.tiles)
      .filter(([, t]) => t.alignment === null)
      .sort(([, a], [, b]) => distance(b.hex, homeHex) - distance(a.hex, homeHex))[0]![0];
    expect(() =>
      cogherenceGame.applyDecision(s, 0, { orders: [{ type: "align", tile: farNeutral, force: 10 }] }),
    ).toThrow(GameError);

    // (b) An unaffordable bid: more energy than the cog has stored (100) — the
    //     engine bounces the set wholesale.
    expect(() => cogherenceGame.applyDecision(s, 0, { orders: [{ type: "bid", energy: 1_000 }] })).toThrow(GameError);
  });

  it("rejects a re-submission from a seat that already acted this turn", () => {
    const s0 = cogherenceGame.newGame({ seed: "0", playerCount: 3, seatNames: [] });
    const afterSeat0 = cogherenceGame.applyDecision(s0, 0, { orders: [] }).state;
    expect(afterSeat0.pending).not.toContain("cog0");
    expect(() => cogherenceGame.applyDecision(afterSeat0, 0, { orders: [] })).toThrow(GameError);
  });
});
