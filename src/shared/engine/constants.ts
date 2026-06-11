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
 *  sprawl taxes itself. RESISTANCE costs no energy — neighbors move COHERENCE
 *  instead: every Upkeep a tile shifts +1 per allied neighbor, −1 per enemy
 *  neighbor (net, clamped 0..COHERENCE_MAX; neutral counts for nothing). The
 *  ally bonus rides on a PAID bill — an unpaid tile still suffers the enemy
 *  drain but gets no healing. At 0 the tile goes neutral. */
export const upkeepBase = (ownedTiles: number): number => Math.floor(Math.sqrt(Math.max(0, ownedTiles)));

/** Density: a tile's deposit richness, 0..DENSITY_MAX as a FLOAT — distributed
 *  by a power law at board generation (density = MAX × u^DENSITY_POWER: most
 *  tiles thin, a few rich) and ground down by Exploit. Always DISPLAYED as
 *  floor(density). */
export const DENSITY_MAX = 10;
export const DENSITY_POWER = 2;
/** Fraction of tiles seeded truly BARREN (density exactly 0). */
export const BARREN_FRACTION = 0.5;

/** Mining: floor(density × coherence / 10) units of the tile's mineral per
 *  Upkeep — deterministic; a full-coherence tile yields floor(density). */
export const mintOf = (density: number, coherence: number): number => Math.floor((density * coherence) / 10);

/** Energy yielded by CONVERTING a full COGS set (1×C + 1×O + 1×Ge + 1×S).
 *  Conversion is the ONLY mineral→energy bridge; singles have no direct value. */
export const SET_ENERGY = 10;

/** STORED energy each Cog starts with (the treasury starts empty — mints
 *  bring minerals in, which convert or trade). */
export const STARTING_ENERGY = 100;

/** First-mover tempo bonus (from cogame-polis): the first Cog to lock its
 *  Commit each turn earns exactly this much stored ENERGY. */
export const FIRST_COMMIT_REWARD = 2;

/** Exploit windfall: EXPLOIT_MULT × coherence × floor(density) units of the
 *  tile's MINERAL (coherence pre-drop) — a huge one-time mineral burst. The
 *  DISPLAYED density is the one that pays: a deposit that reads 0 yields
 *  nothing, and float densities never leak hidden fractional value into the
 *  UI or treasuries. The helper is the ONLY way to compute it. */
export const EXPLOIT_MULT = 10;
export const exploitYield = (coherence: number, density: number): number =>
  EXPLOIT_MULT * coherence * Math.floor(density);

/** Exploit scars the land: density loses coherence/10 (cashing a high-order
 *  tile grinds the deposit down harder); a deposit ground below 1 collapses
 *  to 0 — too thin to ever mine again. */

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
