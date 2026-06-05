// Scripted Cog policies for testing and CLI play (real LLM agents are a later
// plan). Three distinct personalities give a game dynamics: peaceful (expands
// into neutral land / reinforces, never attacks), greedy (pushes into the
// weakest adjacent tile and bids for hearts), and random (one random
// legal+affordable order per turn). Every agent emits only legal, affordable
// orders so its order set is never wholesale-rejected by Resolve. The random
// agent is seeded via a closure RNG that advances across the game — so it is
// single-use per game (construct a fresh instance per `runGame`).

import type { Agent, AgentView } from "./types";
import type { Order } from "../shared/engine/orders";
import type { Tile } from "../shared/engine/types";
import { maxEnergy } from "../shared/engine/energy";
import { neighbors, key } from "../shared/engine/hex";
import { makeRng, randInt } from "../shared/engine/rng";

const myEnergy = (view: AgentView): number => maxEnergy(view.state.cogs[view.me]!.treasury);
const ownedTiles = (view: AgentView): Tile[] =>
  Object.values(view.state.tiles).filter((t) => t.alignment === view.me);

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

/** Peaceful: claims adjacent NEUTRAL land, else reinforces its weakest tile. Never attacks, never bids. */
export const peacefulAgent = (id: string): Agent => ({
  id,
  commit: (view) => {
    const e = myEnergy(view);
    if (e < 1) return [];
    const spend = Math.min(e, 4); // up to 4: enough to claim/hold a tile without over-committing
    const neutral = adjacentTargets(view).filter((t) => t.alignment === null);
    if (neutral.length > 0) return [{ type: "align", tile: key(weakest(neutral).hex), energy: spend }];
    const owned = ownedTiles(view);
    if (owned.length > 0) return [{ type: "align", tile: key(weakest(owned).hex), energy: spend }];
    return [];
  },
});

/** Greedy: pushes into the weakest adjacent tile and bids for hearts, scaling its bid
 *  with wealth (richer cogs win the second-price auction). Spend stays <= maxEnergy. */
export const greedyAgent = (id: string): Agent => ({
  id,
  commit: (view) => {
    const orders: Order[] = [];
    const e = myEnergy(view);
    const targets = adjacentTargets(view);
    let alignSpend = 0;
    if (e >= 2 && targets.length > 0) {
      alignSpend = Math.min(e - 1, 5); // up to 5: enough to flip a max-coherence(6) tile over a couple turns
      orders.push({ type: "align", tile: key(weakest(targets).hex), energy: alignSpend });
    }
    const bidBudget = e - alignSpend; // whatever's left after the push
    if (bidBudget >= 1) orders.push({ type: "bid", energy: Math.min(bidBudget, 1 + Math.floor(e / 10)) });
    return orders;
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
      const amt = Math.min(e, 2);
      if (amt >= 1) {
        for (const t of owned) cands.push({ type: "align", tile: key(t.hex), energy: amt });
        for (const t of adjacentTargets(view)) cands.push({ type: "align", tile: key(t.hex), energy: amt });
        cands.push({ type: "bid", energy: 1 });
      }
      if (owned.length > 1) {
        for (const t of owned) cands.push({ type: "exploit", tile: key(t.hex) }); // never strip-mine your last tile
      }
      if (cands.length === 0) return [];
      return [cands[randInt(rng, cands.length)]!];
    },
  };
};
