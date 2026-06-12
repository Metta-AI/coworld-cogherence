// Economy probe (analysis only, not shipped behavior): runs headless games with
// custom probe agents and prints per-strategy outcomes + board-health telemetry.
// Usage: npx tsx scripts/econ-analysis.ts
import { newGame, stepTurn } from "../src/shared/engine/game";
import { greedyAgent, peacefulAgent, randomAgent } from "../src/agents/stub";
import type { Agent } from "../src/agents/types";
import type { GameState, CogId } from "../src/shared/engine/types";
import type { Order } from "../src/shared/engine/orders";

/** Turtle: never expands, never aligns — sits on the home fortress, banks the
 *  mint surplus, and bids most of the wallet every turn. */
const turtle = (id: string): Agent => ({
  id,
  commit: (view) => {
    const e = view.state.cogs[view.me]!.energy;
    return e >= 2 ? [{ type: "bid", energy: Math.floor(e * 0.8) } as Order] : [];
  },
});

interface Telemetry {
  hearts: Record<string, number>;
  tiles: Record<string, number>;
  energy: Record<string, number>;
  totalCoherence: number;
  neutralFrac: number;
  soleBidderAuctions: number;
  freeHearts: number; // hearts won at price 0
  avgPrice: number;
  pricedAuctions: number;
}

async function run(seed: number, agents: Agent[], turns = 100): Promise<Telemetry> {
  let st: GameState = newGame(seed, agents.length);
  let soleBidderAuctions = 0;
  let freeHearts = 0;
  let priceSum = 0;
  let pricedAuctions = 0;
  while (st.turn <= turns) {
    const orders: Record<CogId, Order[]> = {};
    for (const a of agents) orders[a.id] = await a.commit({ state: st, me: a.id });
    st = stepTurn(st, orders);
    const rec = st.log[st.log.length - 1]!;
    for (const e of rec.events) {
      if (e.type === "auction" && e.winner) {
        if (e.bids.length === 1) soleBidderAuctions++;
        if (e.price === 0) freeHearts++;
        priceSum += e.price;
        pricedAuctions++;
      }
    }
  }
  const tiles: Record<string, number> = {};
  const energy: Record<string, number> = {};
  let totalCoherence = 0;
  let neutral = 0;
  const all = Object.values(st.tiles);
  for (const t of all) {
    totalCoherence += t.coherence;
    if (t.alignment === null) neutral++;
    else tiles[t.alignment] = (tiles[t.alignment] ?? 0) + 1;
  }
  const hearts: Record<string, number> = {};
  for (const id of st.cogOrder) {
    hearts[id] = st.cogs[id]!.hearts;
    energy[id] = st.cogs[id]!.energy;
    tiles[id] = tiles[id] ?? 0;
  }
  return {
    hearts, tiles, energy, totalCoherence,
    neutralFrac: neutral / all.length,
    soleBidderAuctions, freeHearts,
    avgPrice: pricedAuctions ? priceSum / pricedAuctions : 0,
    pricedAuctions,
  };
}

const fmt = (r: Record<string, number>): string =>
  Object.entries(r).map(([k, v]) => `${k}:${Math.round(v)}`).join(" ");

async function matchup(name: string, makeAgents: (seed: number) => Agent[], seeds: number[]): Promise<void> {
  console.log(`\n=== ${name} ===`);
  const agg = { sole: 0, free: 0, price: 0, neutral: 0, coh: 0 };
  for (const seed of seeds) {
    const t = await run(seed, makeAgents(seed));
    agg.sole += t.soleBidderAuctions; agg.free += t.freeHearts; agg.price += t.avgPrice;
    agg.neutral += t.neutralFrac; agg.coh += t.totalCoherence;
    console.log(
      `seed ${seed}  hearts[${fmt(t.hearts)}]  tiles[${fmt(t.tiles)}]  energy[${fmt(t.energy)}]` +
      `  boardCoh ${t.totalCoherence}  neutral ${(t.neutralFrac * 100).toFixed(0)}%` +
      `  soleBid ${t.soleBidderAuctions}/100  freeHearts ${t.freeHearts}  avgPrice ${t.avgPrice.toFixed(1)}e`,
    );
  }
  const n = seeds.length;
  console.log(`AVG: soleBid ${(agg.sole / n).toFixed(0)}  freeHearts ${(agg.free / n).toFixed(0)}  avgPrice ${(agg.price / n).toFixed(1)}e  neutral ${(agg.neutral / n * 100).toFixed(0)}%  boardCoh ${(agg.coh / n).toFixed(0)}`);
}

async function main(): Promise<void> {
  const seeds = [1, 2, 3, 4, 5];
  await matchup("4x greedy (current meta baseline)", () => ["cog0", "cog1", "cog2", "cog3"].map(greedyAgent), seeds);
  await matchup("turtle vs 3x greedy", () => [turtle("cog0"), greedyAgent("cog1"), greedyAgent("cog2"), greedyAgent("cog3")], seeds);
  await matchup("2x turtle vs 2x greedy", () => [turtle("cog0"), turtle("cog1"), greedyAgent("cog2"), greedyAgent("cog3")], seeds);
  await matchup("turtle vs greedy vs peaceful vs random", (s) => [turtle("cog0"), greedyAgent("cog1"), peacefulAgent("cog2"), randomAgent("cog3", s * 1000)], seeds);
  await matchup("4x peaceful (pure expansion test)", () => ["cog0", "cog1", "cog2", "cog3"].map(peacefulAgent), seeds);
}

void main();
