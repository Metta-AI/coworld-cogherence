// Scripted Cog policies for testing and CLI play (real LLM agents are a later
// plan). Three distinct personalities give a game dynamics: peaceful (expands
// into neutral land / reinforces, never attacks), greedy (pushes into the
// weakest adjacent tile and bids for hearts), and random (one random
// legal+affordable order per turn). Every agent emits only legal, affordable
// orders so its order set is never wholesale-rejected by Resolve. The random
// agent is seeded via a closure RNG that advances across the game — so it is
// single-use per game (construct a fresh instance per `runGame`).

import type { Agent, AgentView, Post } from "./types";
import type { Order } from "../shared/engine/orders";
import type { Tile } from "../shared/engine/types";
import { maxEnergy } from "../shared/engine/energy";
import { neighbors, key } from "../shared/engine/hex";
import { makeRng, randInt } from "../shared/engine/rng";

const myEnergy = (view: AgentView): number => maxEnergy(view.state.cogs[view.me]!.treasury);
const ownedTiles = (view: AgentView): Tile[] =>
  Object.values(view.state.tiles).filter((t) => t.alignment === view.me);
/** Coherence available to fund Aligns: Σ max(0, coherence − 1) across owned tiles
 *  (donors never drop below 1 — see resolve's align funding). */
const cohPool = (view: AgentView): number =>
  ownedTiles(view).reduce((s, t) => s + Math.max(0, t.coherence - 1), 0);

/** Non-owned tiles (neutral or enemy) adjacent to the cog's territory — its legal Align targets. */
const adjacentTargets = (view: AgentView): Tile[] => {
  const seen = new Set<string>();
  const out: Tile[] = [];
  for (const t of ownedTiles(view)) {
    for (const n of neighbors(t.hex)) {
      const k = key(n);
      const nt = view.state.tiles[k];
      if (nt && nt.alignment !== view.me && !seen.has(k)) { seen.add(k); out.push(nt); }
    }
  }
  return out;
};
const weakest = (tiles: Tile[]): Tile => tiles.reduce((a, b) => (a.coherence <= b.coherence ? a : b));

/** How many of a tile's in-board neighbors the cog already owns — its blob compactness.
 *  A tile with ≥4 owned neighbors gains Coherence each Upkeep; <4 erodes (design §4). */
const ownNeighborCount = (view: AgentView, t: Tile): number => {
  let n = 0;
  for (const nb of neighbors(t.hex)) {
    const nt = view.state.tiles[key(nb)];
    if (nt && nt.alignment === view.me) n++;
  }
  return n;
};

/** The adjacent target that touches the MOST of our tiles (ties → lowest coherence,
 *  cheapest to take). Claiming these pockets fills concavities into a coherent blob. */
const bestPocket = (view: AgentView): Tile | null => {
  const targets = adjacentTargets(view);
  if (targets.length === 0) return null;
  return targets.reduce((a, b) => {
    const da = ownNeighborCount(view, a);
    const db = ownNeighborCount(view, b);
    return db > da || (db === da && b.coherence < a.coherence) ? b : a;
  });
};

/** Peaceful: claims adjacent NEUTRAL land, else reinforces its weakest tile. Never attacks, never bids. */
export const peacefulAgent = (id: string): Agent => ({
  id,
  commit: (view) => {
    const pool = cohPool(view);
    if (pool < 1) return [];
    const spend = Math.min(pool, 4); // up to 4: enough to claim/hold a tile without bleeding the core
    const neutral = adjacentTargets(view).filter((t) => t.alignment === null);
    if (neutral.length > 0) return [{ type: "align", tile: key(weakest(neutral).hex), coherence: spend }];
    const owned = ownedTiles(view);
    if (owned.length > 0) return [{ type: "align", tile: key(weakest(owned).hex), coherence: spend }];
    return [];
  },
  negotiate: (view) => {
    const PEACE = [
      "Proposing a clean truce on our borders — stability helps everyone.",
      "Open to mineral trades; I'd rather build than brawl.",
      "Holding steady this turn — no aggression from me.",
    ];
    return view.state.turn % 3 === 1 ? [{ to: "public", text: PEACE[Math.floor(view.state.turn / 3) % PEACE.length]! }] : [];
  },
});

/** Greedy: builds a compact blob (so its land earns Coherence instead of rotting to
 *  neutral, §4) and bids leftover energy for hearts, scaling its bid with wealth.
 *  Each turn it first rescues any core tile about to rot, else claims the pocket that
 *  most thickens its territory, else reinforces. Spend stays <= maxEnergy. */
export const greedyAgent = (id: string): Agent => ({
  id,
  commit: (view) => {
    const orders: Order[] = [];
    const owned = ownedTiles(view);
    if (owned.length === 0) {
      if (myEnergy(view) >= 1) orders.push({ type: "bid", energy: 1 });
      return orders;
    }
    // Aligns spend coherence from the blob's pool; never drain it entirely (keep
    // some standing order so the core can still double-pay at Upkeep).
    let pool = Math.max(0, cohPool(view) - 2);
    const align = (t: Tile, want: number): void => {
      const coherence = Math.min(want, pool);
      if (coherence >= 1) {
        orders.push({ type: "align", tile: key(t.hex), coherence });
        pool -= coherence;
      }
    };

    // 1. Rescue any core tile one Upkeep from rotting to neutral.
    const critical = owned
      .filter((t) => t.coherence <= 1 && ownNeighborCount(view, t) >= 2)
      .sort((a, b) => a.coherence - b.coherence)[0];
    if (critical) align(critical, 3);
    // 2. Grow: when the pool is flush, claim the pocket that most thickens the blob.
    const pocket = bestPocket(view);
    if (pocket && pool >= 4) align(pocket, 3);

    // 3. Bid energy, scaling with wealth (richer cogs take the second-price auction).
    const budget = myEnergy(view);
    if (budget >= 1) orders.push({ type: "bid", energy: Math.min(budget, 1 + Math.floor(budget / 10)) });
    return orders;
  },
  negotiate: (view) => {
    const GREED = [
      "I'm bidding hard for this heart — save your energy.",
      "Pushing into the weakest frontier; stay clear.",
      "Whoever's leading should expect pressure from me.",
    ];
    const posts: Post[] = [];
    if (view.state.turn % 2 === 0) posts.push({ to: "public", text: GREED[Math.floor(view.state.turn / 2) % GREED.length]! });
    const enemy = adjacentTargets(view).find((t) => t.alignment !== null);
    if (enemy && enemy.alignment && view.state.turn % 6 === 0)
      posts.push({ to: enemy.alignment, text: "Back off my frontier or I take that tile." });
    return posts;
  },
});

/** Random: one random legal, affordable order per turn (or nothing). Seeded — single-use per game. */
export const randomAgent = (id: string, seed: number): Agent => {
  const rng = makeRng(seed);
  return {
    id,
    commit: (view) => {
      const e = myEnergy(view);
      const owned = ownedTiles(view);
      const cands: Order[] = [];
      const amt = Math.min(cohPool(view), 2);
      if (amt >= 1) {
        for (const t of owned) cands.push({ type: "align", tile: key(t.hex), coherence: amt });
        for (const t of adjacentTargets(view)) cands.push({ type: "align", tile: key(t.hex), coherence: amt });
      }
      if (e >= 1) cands.push({ type: "bid", energy: 1 });
      if (owned.length > 1) {
        for (const t of owned) cands.push({ type: "exploit", tile: key(t.hex) }); // never strip-mine your last tile
        for (const t of owned) cands.push({ type: "abandon", tile: key(t.hex) }); // nor abandon it
      }
      if (cands.length === 0) return [];
      return [cands[randInt(rng, cands.length)]!];
    },
    negotiate: (view) => {
      const CHAT = [
        "Anyone want to coordinate against the leader?",
        "Watching the board — might strike, might not.",
        "Open to a deal if the price is right.",
      ];
      return view.state.turn % 4 === 2 ? [{ to: "public", text: CHAT[Math.floor(view.state.turn / 4) % CHAT.length]! }] : [];
    },
  };
};
