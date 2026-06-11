// Tunable game constants. v1 defaults are LOCKED in
// docs/plans/2026-06-04-cogherence-engine.md ("Canonical Resolution Semantics").

/** Maximum Coherence a tile can reach — a tile's 0–10 "margin of dominance" score. */
export const COHERENCE_MAX = 10;

/** Board radius in hexes. Radius 6 => 127 tiles. */
export const BOARD_RADIUS = 6;

/** Number of turns in a full game. */
export const MAX_TURNS = 100;

/** Per-tile upkeep, per turn: a base that SCALES WITH EMPIRE SIZE —
 *  floor(sqrt(tiles owned)) per tile, so total base spend grows ~N^1.5 and
 *  sprawl taxes itself — plus RESISTANCE: RESISTANCE_COST energy per
 *  enemy-aligned neighbor. Allies do NOT cheapen defense (neutral neighbors
 *  count for nothing) — their value is healing speed instead: a tile may
 *  regenerate up to maxRegen(allies) Coherence per Upkeep, each +1 costing
 *  REGEN_COST on top of a paid bill. An unpaid tile UNDER resistance loses 1
 *  (neutral at 0) while zero-resistance ground holds even unpaid. */
export const REGEN_COST = 3;
export const RESISTANCE_COST = 10;
export const upkeepBase = (ownedTiles: number): number => Math.floor(Math.sqrt(Math.max(0, ownedTiles)));
export const tileUpkeepCost = (enemies: number, ownedTiles: number): number =>
  upkeepBase(ownedTiles) + RESISTANCE_COST * enemies;
/** Coherence a tile may regenerate in one Upkeep: 1, +1 per two allied neighbors. */
export const maxRegen = (friendly: number): number => 1 + Math.floor(friendly / 2);

/** Density: a tile's deposit richness, 0..DENSITY_MAX as a FLOAT — distributed
 *  by a power law at board generation (density = MAX × u^DENSITY_POWER: most
 *  tiles thin, a few rich) and ground down by Exploit. Always DISPLAYED as
 *  floor(density). */
export const DENSITY_MAX = 10;
export const DENSITY_POWER = 2;

/** Mining: floor(density × coherence / 10) units of the tile's mineral per
 *  Upkeep — deterministic; a full-coherence tile yields floor(density). */
export const mintOf = (density: number, coherence: number): number => Math.floor((density * coherence) / 10);

/** Energy yielded by a full COGS set (1×C + 1×O + 1×Ge + 1×S). */
export const SET_ENERGY = 10;

/** Energy each Cog starts with — seeded as a balanced COGS wallet, so a fresh
 *  Cog can act from turn 1. maxEnergy(starting treasury) == STARTING_ENERGY. */
export const STARTING_ENERGY = 100;

/** First-mover tempo bonus (from cogame-polis): the first Cog to lock its Commit
 *  each turn earns exactly this much ENERGY — paid as units of its most abundant
 *  mineral, whose marginal value is precisely +1 energy each (adding to the max
 *  never completes a COGS set) — rewarding decisiveness without warping the
 *  mineral economy. */
export const FIRST_COMMIT_REWARD = 2;

/** Energy yielded by a single leftover mineral. */
export const SINGLE_ENERGY = 1;

/** Exploit windfall = EXPLOIT_MULT × coherence × density units of the tile's
 *  MINERAL (coherence pre-drop) — a huge one-time mineral burst. */
export const EXPLOIT_MULT = 10;

/** Exploit scars the land: density loses coherence/10 (cashing a high-order
 *  tile grinds the deposit down harder), floored at 0. */

/** Energy charged per Transfer order. */
export const TRANSFER_FEE = 1;

/** Align economics: an Align commits FORCE (1..COHERENCE_MAX) and the engine
 *  bills the energy: cost = force² + distance², where distance is to the cog's
 *  closest tile (own tile = 0). A cost above ALIGN_MAX_ENERGY is out of reach
 *  and rejected; the full cost is charged win or lose. Force 10 at distance 0
 *  costs exactly 100e — a maxed fortress is a full fortune to stamp out. */
export const ALIGN_MAX_ENERGY = 100;
export const alignEnergyCost = (force: number, dist: number): number => force * force + dist * dist;
/** Repeat-align tax: the k-th Align a cog submits in ONE turn (0-indexed)
 *  costs an extra k × this much energy — first free, then +10, +20, … The
 *  surcharge is pure overhead: it buys no force. */
export const ALIGN_REPEAT_SURCHARGE = 10;
