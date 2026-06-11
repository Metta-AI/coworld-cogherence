// The serializable core data model: minerals, the board (`Tile`), per-Cog
// state, phases, and the top-level `GameState` that every other engine module
// imports. Types only — no behavior; correctness is checked by `tsc --noEmit`.

import type { Hex } from "./hex";

/** The four minerals, in canonical order — the single source of truth (their letters spell COGS). */
export const MINERALS = ["C", "O", "Ge", "S"] as const;

/** The four mineral types Cogs mine, trade, and burn for energy. */
export type Mineral = (typeof MINERALS)[number];

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
  /** The deposit as generated — exploits halve `density` but never this, so views
   *  can show what a scarred tile used to be worth. */
  density0: number;
}

/** Per-Cog mutable state: identity, turn-order index, treasury, and hearts. */
export interface CogState {
  id: CogId;
  index: number;
  /** Display name — a default seat name, or whatever a claimer chose. */
  name: string;
  treasury: Treasury;
  hearts: number;
}

/**
 * The phases a turn cycles through, in order: cheap talk, sealed commit, board
 * resolution, the Vickrey heart auction, then the world's upkeep. NOTE: the
 * headless engine runs resolve/auction/upkeep synchronously inside `stepTurn`, so
 * `GameState.phase` only ever holds "negotiate". The other members are driven by
 * the live server, which steps the phase machine across network round-trips.
 */
export type Phase = "negotiate" | "commit" | "resolve" | "auction" | "upkeep";

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
