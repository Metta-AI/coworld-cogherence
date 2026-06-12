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
import { neighbors, key, distance } from "../shared/engine/hex";
import { ALIGN_MAX_ENERGY, ALIGN_REPEAT_SURCHARGE, alignEnergyCost, upkeepBase } from "../shared/engine/constants";
import { makeRng, randInt } from "../shared/engine/rng";

const myEnergy = (view: AgentView): number => view.state.cogs[view.me]!.energy;
const ownedTiles = (view: AgentView): Tile[] =>
  Object.values(view.state.tiles).filter((t) => t.alignment === view.me);
/** What an Align of `force` from `dist` hexes away bills (force² + dist²); a
 *  cost above ALIGN_MAX_ENERGY is out of reach for the engine. */
const alignCostFor = alignEnergyCost;
const inReach = (force: number, dist: number): boolean => alignEnergyCost(force, dist) <= ALIGN_MAX_ENERGY;

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

/** The nearest NEUTRAL non-barren tile and its distance from the cog's closest
 *  tile (ties -> denser ground). Align energy scales with distance², so closer
 *  is much cheaper. */
const nearestNeutral = (view: AgentView): { tile: Tile; dist: number } | null => {
  const owned = ownedTiles(view);
  if (owned.length === 0) return null;
  let best: { tile: Tile; dist: number } | null = null;
  for (const t of Object.values(view.state.tiles)) {
    if (t.alignment !== null || Math.floor(t.density) < 1) continue; // skip claimed + near-barren ground
    let d = Infinity;
    for (const o of owned) d = Math.min(d, distance(o.hex, t.hex));
    if (!best || d < best.dist || (d === best.dist && t.density > best.tile.density)) best = { tile: t, dist: d };
  }
  return best;
};


/** How many of a tile's in-board neighbors the cog already owns — its blob
 *  compactness. Allied neighbors cancel enemy resistance on the upkeep bill,
 *  so compact ground is cheap and rot-proof (design §4/§6). */
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
    // Settle the NEAREST neutral ground — align energy scales with distance² —
    // keeping a few turns of bills in reserve...
    const owned = ownedTiles(view);
    const spot = nearestNeutral(view);
    if (spot) {
      const spare = myEnergy(view) - Math.max(2, owned.length) * (upkeepBase(owned.length) + 1);
      // aim to arrive at force 2; fall back to 1 when the budget is thin
      const force = alignCostFor(2, spot.dist) <= spare ? 2 : 1;
      if (alignCostFor(force, spot.dist) <= spare && inReach(force, spot.dist))
        return [{ type: "align", tile: key(spot.tile.hex), force }];
      return [];
    }
    // ...else shore up the weakest tile (distance 0: cost = force²).
    if (owned.length > 0) {
      const target = weakest(owned);
      const spare = myEnergy(view) - Math.max(2, owned.length) * (upkeepBase(owned.length) + 1);
      const force = alignCostFor(2, 0) <= spare ? 2 : 1;
      if (alignCostFor(force, 0) <= spare) return [{ type: "align", tile: key(target.hex), force }];
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

/** Greedy: builds a compact blob (so its land stays cheap instead of rotting to
 *  neutral, §4) and bids leftover energy for hearts, scaling its bid with wealth.
 *  Each turn it first rescues any core tile about to rot, else claims the pocket that
 *  most thickens its territory, else reinforces. Spend stays <= maxEnergy. */
export const greedyAgent = (id: string): Agent => ({
  id,
  commit: (view) => {
    const orders: Order[] = [];
    const owned = ownedTiles(view);
    if (owned.length === 0) return []; // off the board: nothing to project from, no right to bid
    let energy = myEnergy(view);
    const billsReserve = owned.length * (upkeepBase(owned.length) + 1); // ~a turn of bills stays banked
    const afford = (cost: number): boolean => energy - billsReserve >= cost;
    // each extra Align this turn bills +10e overhead — budget it alongside the order
    let alignsMade = 0;
    const surcharge = (): number => alignsMade * ALIGN_REPEAT_SURCHARGE;
    const queueAlign = (tile: string, force: number, cost: number): void => {
      orders.push({ type: "align", tile, force });
      energy -= cost + surcharge();
      alignsMade++;
    };

    // 1. Rescue any core tile one Upkeep from rotting to neutral (force 2 at distance 0 = 4e).
    const critical = owned
      .filter((t) => t.coherence <= 1 && ownNeighborCount(view, t) >= 2)
      .sort((a, b) => a.coherence - b.coherence)[0];
    if (critical && afford(alignCostFor(2, 0) + surcharge())) {
      queueAlign(key(critical.hex), 2, alignCostFor(2, 0));
    }
    // 2. Settle: claim the neutral pocket that most thickens the blob; with no
    //    adjacent pocket, reach for the nearest neutral ground (cost rises with
    //    distance² under the sqrt arrival curve).
    const pocket = bestPocket(view);
    if (pocket && pocket.alignment === null && afford(alignCostFor(2, 1) + surcharge())) {
      queueAlign(key(pocket.hex), 2, alignCostFor(2, 1));
    } else {
      const spot = nearestNeutral(view);
      const cost = spot ? alignCostFor(2, spot.dist) : Infinity;
      if (spot && spot.dist > 1 && inReach(2, spot.dist) && afford(cost + surcharge())) {
        queueAlign(key(spot.tile.hex), 2, cost);
      }
    }
    // 3. Raid: flip a weak adjacent enemy when the war chest covers arriving force
    //    coherence+2 (captures it at 2) with room to spare.
    const prey = adjacentTargets(view)
      .filter((t) => t.alignment !== null && t.coherence <= 2)
      .sort((a, b) => a.coherence - b.coherence)[0];
    if (prey) {
      const force = prey.coherence + 2;
      const cost = alignCostFor(force, 1);
      if (inReach(force, 1) && afford(cost + surcharge() + 4)) {
        queueAlign(key(prey.hex), force, cost);
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
        if (e >= alignCostFor(1, 0)) cands.push({ type: "align", tile: key(t.hex), force: 1 }); // 1e at distance 0
      }
      for (const t of adjacentTargets(view)) {
        if (e >= alignCostFor(1, 1)) cands.push({ type: "align", tile: key(t.hex), force: 1 }); // 2e adjacent
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
