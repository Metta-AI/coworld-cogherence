// Initial GameState construction: a seeded radius-BOARD_RADIUS hex board with a
// random mineral + density per tile, plus one home tile per Cog spaced evenly
// around the outer ring at full coherence. Deterministic for a given seed so
// games are reproducible.

import { makeRng, randInt } from "./rng";
import { hexesInRadius, key, distance } from "./hex";
import { MINERALS, emptyTreasury } from "./types";
import type { GameState, Tile, CogState, CogId } from "./types";
import { BOARD_RADIUS, COHERENCE_MAX } from "./constants";

const ORIGIN = { q: 0, r: 0 };

/**
 * Generate the initial GameState: a radius-BOARD_RADIUS hex board with random
 * mineral + density per tile (seeded), and one home tile per Cog placed evenly
 * around the outer ring at full coherence. Deterministic for a given seed.
 */
export function generateBoard(seed: number, numCogs: number): GameState {
  const rng = makeRng(seed);
  const hexes = hexesInRadius(BOARD_RADIUS);

  const tiles: Record<string, Tile> = {};
  for (const hex of hexes) {
    const mineral = MINERALS[randInt(rng, MINERALS.length)]!;
    const density = 1 + randInt(rng, 3); // 1..3
    tiles[key(hex)] = { hex, alignment: null, coherence: 0, mineral, density };
  }

  const ring = hexes.filter((h) => distance(h, ORIGIN) === BOARD_RADIUS);
  const cogs: Record<CogId, CogState> = {};
  const cogOrder: CogId[] = [];
  for (let i = 0; i < numCogs; i++) {
    const id: CogId = `cog${i}`;
    cogOrder.push(id);
    cogs[id] = { id, index: i, treasury: emptyTreasury(), hearts: 0 };
    const home = ring[Math.floor((i * ring.length) / numCogs)]!;
    const tile = tiles[key(home)]!;
    tile.alignment = id;
    tile.coherence = COHERENCE_MAX;
  }

  return { turn: 1, phase: "negotiate", seed, tiles, cogs, cogOrder, log: [] };
}
