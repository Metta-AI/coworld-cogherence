// Initial GameState construction: a seeded radius-BOARD_RADIUS hex board with a
// random mineral + density per tile, plus one home tile per Cog placed at the
// board's corners (spread apart) at full coherence. Deterministic for a given
// seed so games are reproducible.

import { makeRng, randInt } from "./rng";
import { hexesInRadius, key } from "./hex";
import { MINERALS } from "./types";
import type { GameState, Tile, CogState, CogId, Treasury } from "./types";
import { BARREN_FRACTION, BOARD_RADIUS, COHERENCE_MAX, DENSITY_MAX, DENSITY_POWER, SET_ENERGY, STARTING_ENERGY } from "./constants";

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
export function generateBoard(seed: number, numCogs: number, names?: string[]): GameState {
  const rng = makeRng(seed);
  const hexes = hexesInRadius(BOARD_RADIUS);

  const tiles: Record<string, Tile> = {};
  for (const hex of hexes) {
    const mineral = MINERALS[randInt(rng, MINERALS.length)]!;
    // Half the board is truly BARREN (density 0); the rest follows a power law
    // over 0..DENSITY_MAX (density = MAX × u^POWER — most deposits thin, rich
    // ones rare). Stored as a float; every display floors it.
    const density = rng() < BARREN_FRACTION ? 0 : DENSITY_MAX * rng() ** DENSITY_POWER;
    tiles[key(hex)] = { hex, alignment: null, coherence: 0, mineral, density, density0: density };
  }

  // The six corners of the hex board, in rotational order; spread cogs across them.
  const corners = boardCorners();

  // Strategic landmarks — the six corners and the center — are always rich.
  for (const hex of [...corners, { q: 0, r: 0 }]) {
    tiles[key(hex)]!.density = DENSITY_MAX;
    tiles[key(hex)]!.density0 = DENSITY_MAX;
  }

  const cogs: Record<CogId, CogState> = {};
  const cogOrder: CogId[] = [];
  for (let i = 0; i < numCogs; i++) {
    const id: CogId = `cog${i}`;
    cogOrder.push(id);
    cogs[id] = { id, index: i, name: names?.[i]?.trim() || defaultCogName(i), treasury: startingTreasury(), hearts: 0 };
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
/** Default seat names, one per corner; a claimed cog may wear any name (addCog). */
export const COG_NAMES = ["Alice", "Bob", "Carol", "David", "Erin", "Frank"];
export const defaultCogName = (index: number): string => COG_NAMES[index] ?? `Cog ${index + 1}`;

export function addCog(state: GameState, name?: string): GameState {
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
    [id]: { id, index, name: name?.trim() || defaultCogName(index), treasury: startingTreasury(), hearts: 0 },
  };
  return { ...state, tiles, cogs, cogOrder: [...state.cogOrder, id] };
}
