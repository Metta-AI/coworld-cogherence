// The serializable core data model: minerals, the board (`Tile`), per-Cog
// state, phases, and the top-level `GameState` that every other engine module
// imports. Types only — no behavior; correctness is checked by `tsc --noEmit`.

import type { Hex } from "./hex";

/** The four mineral types Cogs mine, trade, and burn for energy. */
export type Mineral = "C" | "O" | "Ge" | "S";

/** All minerals in canonical order. */
export const MINERALS: Mineral[] = ["C", "O", "Ge", "S"];

/** Stable identifier for a Cog. */
export type CogId = string;

/** A tile map key, the `${q},${r}` string for a hex (see `hex.key`). */
export type HexKey = string;

/** A Cog's mineral holdings, one count per mineral. */
export type Treasury = Record<Mineral, number>;

/** A single board cell: its position, alignment, coherence, and mineral. */
export interface Tile {
  hex: Hex;
  alignment: CogId | null;
  coherence: number;
  mineral: Mineral;
  density: number;
}

/** Per-Cog mutable state: identity, turn-order index, treasury, and hearts. */
export interface CogState {
  id: CogId;
  index: number;
  treasury: Treasury;
  hearts: number;
}

/** The phases a turn cycles through, in order. */
export type Phase = "negotiate" | "commit" | "resolve" | "upkeep";

/** The complete, serializable game state at a point in time. */
export interface GameState {
  turn: number;
  phase: Phase;
  seed: number;
  tiles: Record<HexKey, Tile>;
  cogs: Record<CogId, CogState>;
  cogOrder: CogId[]; // stable order for tiebreaks
  log: import("./log").TurnRecord[];
}

/** Build a zeroed treasury, one count per mineral. */
export const emptyTreasury = (): Treasury => ({ C: 0, O: 0, Ge: 0, S: 0 });
