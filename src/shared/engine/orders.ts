// The agent-facing order vocabulary: a zod-validated `Order` discriminated union
// (align / exploit / transfer / bid) parsed at the Commit-phase boundary so that
// untrusted LLM/agent input is rejected before it reaches Resolve, plus the
// board-rule legality predicates Resolve uses. Legality is purely spatial here;
// affordability (budget) is enforced separately in Resolve.

import { z } from "zod";
import { MINERALS } from "./types";
import type { GameState, CogId, HexKey } from "./types";
import { distance } from "./hex";
import { ALIGN_MAX_ENERGY } from "./constants";

/** A heart-auction bid (energy). 0 means "no bid". */
const BidOrder = z.object({ type: z.literal("bid"), energy: z.number().int().nonnegative() });
/** Commit ENERGY to a tile's tug-of-war (expand / capture / reinforce) — ANY
 *  in-board tile. The force arriving = floor(sqrt(energy − distance²)), where
 *  distance is to the cog's closest tile (see alignForce). The full energy is
 *  charged win or lose; a set the cog cannot fund is rejected wholesale. */
const AlignOrder = z.object({ type: z.literal("align"), tile: z.string(), energy: z.number().int().positive().max(ALIGN_MAX_ENERGY) });
/** Strip-mine an owned tile for a one-time windfall. */
const ExploitOrder = z.object({ type: z.literal("exploit"), tile: z.string() });
/** Return an owned tile to neutral; its standing coherence comes home as energy. */
const AbandonOrder = z.object({ type: z.literal("abandon"), tile: z.string() });
/** Send minerals to another Cog. */
const TransferOrder = z.object({
  type: z.literal("transfer"),
  to: z.string(),
  mineral: z.enum(MINERALS),
  amount: z.number().int().positive(),
});

/** A single agent order. Validated at the agent boundary (Commit phase). */
export const OrderSchema = z.discriminatedUnion("type", [AlignOrder, ExploitOrder, AbandonOrder, TransferOrder, BidOrder]);
export type Order = z.infer<typeof OrderSchema>;

/** True iff `tile` exists and is aligned to `cog` (used to validate Exploit). */
export function isOwn(state: GameState, cog: CogId, tile: HexKey): boolean {
  const t = state.tiles[tile];
  return t !== undefined && t.alignment === cog;
}

/**
 * True iff `cog` may Align `tile`: the tile is in-board and the cog holds at
 * least one tile for the influence to project FROM. Any distance is legal —
 * force decays with it (see alignDistance / DISTANCE_FORCE_DECAY).
 */
export function isLegalAlignTarget(state: GameState, cog: CogId, tile: HexKey): boolean {
  const t = state.tiles[tile];
  if (t === undefined) return false;
  if (t.alignment === cog) return true;
  return Object.values(state.tiles).some((x) => x.alignment === cog);
}

/** Hex distance from `tile` to the cog's CLOSEST tile (0 when it owns the tile,
 *  Infinity when it holds no ground). Drives the align force decay. */
export function alignDistance(state: GameState, cog: CogId, tile: HexKey): number {
  const t = state.tiles[tile];
  if (t === undefined) return Infinity;
  if (t.alignment === cog) return 0;
  let best = Infinity;
  for (const x of Object.values(state.tiles)) {
    if (x.alignment === cog) best = Math.min(best, distance(x.hex, t.hex));
  }
  return best;
}
