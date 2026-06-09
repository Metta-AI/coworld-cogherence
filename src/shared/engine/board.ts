// Initial GameState construction: a seeded radius-BOARD_RADIUS hex board with a
// random mineral + density per tile, plus one home tile per Cog placed at the
// board's corners (spread apart) at full coherence. Deterministic for a given
// seed so games are reproducible.

import { makeRng, randInt } from "./rng";
import { hexesInRadius, key } from "./hex";
import { MINERALS } from "./types";
import type { GameState, Tile, CogState, CogId, Treasury } from "./types";
import { BOARD_RADIUS, COHERENCE_MAX, SET_ENERGY, STARTING_ENERGY } from "./constants";

/** A balanced starting wallet worth exactly STARTING_ENERGY (maxEnergy of N full sets). */
const startingTreasury = (): Treasury => {
  const each = STARTING_ENERGY / SET_ENERGY;
  return { C: each, O: each, Ge: each, S: each };
};

/** The six corner hexes in rotational order — the board's home sites. */
const boardCorners = (): Array<{ q: number; r: number }> => {
  const R = BOARD_RADIUS;
  return [
    { q: R, r: 0 },
    { q: R, r: -R },
    { q: 0, r: -R },
    { q: -R, r: 0 },
    { q: -R, r: R },
    { q: 0, r: R },
  ];
};

/**
 * Generate the initial GameState: a radius-BOARD_RADIUS hex board with random
 * mineral + density per tile (seeded), and one home tile per Cog placed at the
 * board's six corners (spread apart) at full coherence. Deterministic for a seed.
 */
export function generateBoard(seed: number, numCogs: number): GameState {
  const rng = makeRng(seed);
  const hexes = hexesInRadius(BOARD_RADIUS);

  const tiles: Record<string, Tile> = {};
  for (const hex of hexes) {
    const mineral = MINERALS[randInt(rng, MINERALS.length)]!;
    // Weighted density: 20% barren (no deposit), and across the rest most
    // deposits are thin while rich ones stay rare — 20/48/24/8 over 0/1/2/3.
    const roll = rng();
    const density = roll < 0.2 ? 0 : roll < 0.68 ? 1 : roll < 0.92 ? 2 : 3;
    tiles[key(hex)] = { hex, alignment: null, coherence: 0, mineral, density, density0: density };
  }

  // The six corners of the hex board, in rotational order; spread cogs across them.
  const corners = boardCorners();

  // Strategic landmarks — the six corners and the center — are always rich (density 3).
  for (const hex of [...corners, { q: 0, r: 0 }]) {
    tiles[key(hex)]!.density = 3;
    tiles[key(hex)]!.density0 = 3;
  }

  const cogs: Record<CogId, CogState> = {};
  const cogOrder: CogId[] = [];
  for (let i = 0; i < numCogs; i++) {
    const id: CogId = `cog${i}`;
    cogOrder.push(id);
    cogs[id] = { id, index: i, treasury: startingTreasury(), hearts: 0 };
    const home = corners[Math.floor((i * corners.length) / numCogs)]!;
    const tile = tiles[key(home)]!;
    tile.alignment = id;
    tile.coherence = COHERENCE_MAX;
  }

  return { turn: 1, phase: "negotiate", seed, tiles, cogs, cogOrder, log: [] };
}

/**
 * Seat one new Cog mid-game: the next seat index (`cog${n}`), the standard
 * starting wallet, and a home tile at the first UNOWNED corner at full
 * coherence. Pure; throws when the board is out of seats or free corners.
 */
export function addCog(state: GameState): GameState {
  const index = state.cogOrder.length;
  if (index >= 6) throw new Error("addCog: the board seats at most 6 cogs");
  const id: CogId = `cog${index}`;
  const home = boardCorners().find((h) => state.tiles[key(h)]!.alignment === null);
  if (!home) throw new Error("addCog: no free corner to seat a new cog");
  const homeKey = key(home);
  const tiles = {
    ...state.tiles,
    [homeKey]: { ...state.tiles[homeKey]!, alignment: id, coherence: COHERENCE_MAX },
  };
  const cogs: Record<CogId, CogState> = {
    ...state.cogs,
    [id]: { id, index, treasury: startingTreasury(), hearts: 0 },
  };
  return { ...state, tiles, cogs, cogOrder: [...state.cogOrder, id] };
}
