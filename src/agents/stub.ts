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
/** Coherence available to fund WAR Aligns: Σ max(0, coherence − 1) across owned
 *  tiles, optionally excluding one (the align target can't donate to itself). */
const cohPool = (view: AgentView, excludeKey?: string): number =>
  ownedTiles(view).reduce((s, t) => (key(t.hex) === excludeKey ? s : s + Math.max(0, t.coherence - 1)), 0);

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
    // Settle neutral land with energy (keep a few turns of bills in reserve)...
    const neutral = adjacentTargets(view).filter((t) => t.alignment === null);
    const owned = ownedTiles(view);
    if (neutral.length > 0) {
      const spare = myEnergy(view) - 2 * Math.max(2, owned.length);
      const force = Math.min(spare, 4);
      if (force >= 1) return [{ type: "align", tile: key(weakest(neutral).hex), force }];
      return [];
    }
    // ...else shore up the weakest tile from the coherence pool.
    if (owned.length > 0) {
      const target = weakest(owned);
      const force = Math.min(cohPool(view, key(target.hex)), 4);
      if (force >= 1) return [{ type: "align", tile: key(target.hex), force }];
    }
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
    if (owned.length === 0) return []; // off the board: no adjacency to align, no right to bid
    // War chest: the coherence pool funds rescues and raids; keep a small reserve.
    let pool = Math.max(0, cohPool(view) - 2);
    let energy = myEnergy(view);
    const billsReserve = 2 * owned.length; // ~a turn of worst-ish bills stays banked

    // 1. Rescue any core tile one Upkeep from rotting to neutral (own tile -> pool).
    const critical = owned
      .filter((t) => t.coherence <= 1 && ownNeighborCount(view, t) >= 2)
      .sort((a, b) => a.coherence - b.coherence)[0];
    if (critical) {
      const force = Math.min(3, Math.max(0, cohPool(view, key(critical.hex)) - 2));
      if (force >= 1) {
        orders.push({ type: "align", tile: key(critical.hex), force });
        pool -= force;
      }
    }
    // 2. Settle: claim the neutral pocket that most thickens the blob (energy).
    const pocket = bestPocket(view);
    if (pocket && pocket.alignment === null && energy - billsReserve >= 3) {
      orders.push({ type: "align", tile: key(pocket.hex), force: 3 });
      energy -= 3;
    }
    // 3. Raid: flip a weak adjacent enemy when the pool covers it comfortably.
    const prey = adjacentTargets(view)
      .filter((t) => t.alignment !== null && t.coherence <= 2)
      .sort((a, b) => a.coherence - b.coherence)[0];
    if (prey) {
      const force = prey.coherence + 2;
      if (pool - force >= 2) {
        orders.push({ type: "align", tile: key(prey.hex), force });
        pool -= force;
      }
    }

    // 4. Bid the spare energy, scaling with wealth (it is a second-price auction).
    if (energy >= 1) orders.push({ type: "bid", energy: Math.min(energy, 1 + Math.floor(energy / 10)) });
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
      for (const t of owned) {
        const amt = Math.min(cohPool(view, key(t.hex)), 2); // reinforce: pool minus the target itself
        if (amt >= 1) cands.push({ type: "align", tile: key(t.hex), force: amt });
      }
      for (const t of adjacentTargets(view)) {
        const amt = Math.min(t.alignment === null ? e : cohPool(view), 2); // settle: energy; raid: pool
        if (amt >= 1) cands.push({ type: "align", tile: key(t.hex), force: amt });
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
