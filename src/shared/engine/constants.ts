// Tunable game constants. v1 defaults are LOCKED in
// docs/plans/2026-06-04-cogherence-engine.md ("Canonical Resolution Semantics").

/** Maximum Coherence a tile can reach — a tile's 0–10 "margin of dominance" score. */
export const COHERENCE_MAX = 10;

/** Board radius in hexes. Radius 6 => 127 tiles. */
export const BOARD_RADIUS = 6;

/** Number of turns in a full game. */
export const MAX_TURNS = 100;

/** Energy owed per aligned tile each Upkeep. */
export const UPKEEP_PER_TILE = 1;

/** Mineral minted per Upkeep = density × coherence / MINT_DIVISOR, stochastically
 *  rounded: a raw 2.3 mints 2, plus 1 with probability 0.3. With COHERENCE_MAX 10
 *  a tile at full coherence yields its density; weaker tiles yield proportionally
 *  less. Keeps mineral output (and so the whole economy) on a tractable scale. */
export const MINT_DIVISOR = 10;

/** Energy yielded by a full COGS set (1×C + 1×O + 1×Ge + 1×S). */
export const SET_ENERGY = 10;

/** Energy each Cog starts with — seeded as a balanced COGS wallet, so a fresh
 *  Cog can act from turn 1. maxEnergy(starting treasury) == STARTING_ENERGY. */
export const STARTING_ENERGY = 100;

/** First-mover tempo bonus (from cogame-polis): the first Cog to lock its Commit
 *  each turn gets this many units of its scarcest mineral — rewarding decisiveness
 *  and nudging toward the balanced wallet that forms efficient COGS sets. */
export const FIRST_COMMIT_REWARD = 2;

/** Energy yielded by a single leftover mineral. */
export const SINGLE_ENERGY = 1;

/** Exploit windfall = EXPLOIT_MULT × coherence × density (coherence pre-drop). */
export const EXPLOIT_MULT = 2;

/** Exploit scars the land: density = floor(density × EXPLOIT_DENSITY), min 0. */
export const EXPLOIT_DENSITY = 0.5;

/** Energy charged per Transfer order. */
export const TRANSFER_FEE = 1;
