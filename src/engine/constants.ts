// Tunable game constants. v1 defaults are LOCKED in
// docs/plans/2026-06-04-cogherence-engine.md ("Canonical Resolution Semantics").

/** Maximum Coherence a tile can reach (= neighbor count). */
export const COHERENCE_MAX = 6;

/** Board radius in hexes. Radius 6 => 127 tiles. */
export const BOARD_RADIUS = 6;

/** Number of turns in a full game. */
export const MAX_TURNS = 100;

/** Energy owed per aligned tile each Upkeep. */
export const UPKEEP_PER_TILE = 1;

/** Energy yielded by a full COGS set (1×C + 1×O + 1×Ge + 1×S). */
export const SET_ENERGY = 10;

/** Energy yielded by a single leftover mineral. */
export const SINGLE_ENERGY = 1;

/** Exploit windfall = EXPLOIT_MULT × coherence × density (coherence pre-drop). */
export const EXPLOIT_MULT = 2;

/** Exploit scars the land: density = floor(density × EXPLOIT_DENSITY), min 0. */
export const EXPLOIT_DENSITY = 0.5;

/** Energy charged per Transfer order. */
export const TRANSFER_FEE = 1;
