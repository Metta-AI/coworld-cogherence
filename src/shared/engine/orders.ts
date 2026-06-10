// The agent-facing order vocabulary: a zod-validated `Order` discriminated union
// (align / exploit / transfer / bid) parsed at the Commit-phase boundary so that
// untrusted LLM/agent input is rejected before it reaches Resolve, plus the
// board-rule legality predicates Resolve uses. Legality is purely spatial here;
// affordability (budget) is enforced separately in Resolve.

import { z } from "zod";
import { MINERALS } from "./types";
import type { GameState, CogId, HexKey } from "./types";
import { neighbors, key } from "./hex";

/** A heart-auction bid (energy). 0 means "no bid". */
const BidOrder = z.object({ type: z.literal("bid"), energy: z.number().int().nonnegative() });
/** Pour COHERENCE into a tile (expand / capture / reinforce). The committed
 *  coherence is transferred OUT of the cog's other tiles, largest first; a donor
 *  tile never drops below 1, and a set whose Aligns exceed the available pool is
 *  rejected wholesale. */
const AlignOrder = z.object({ type: z.literal("align"), tile: z.string(), coherence: z.number().int().positive() });
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
 * True iff `cog` may Align `tile`: the tile is in-board AND is either the cog's
 * own tile (reinforce) or adjacent to at least one tile the cog owns. Influence
 * can only spread from existing territory.
 */
export function isLegalAlignTarget(state: GameState, cog: CogId, tile: HexKey): boolean {
  const t = state.tiles[tile];
  if (t === undefined) return false;
  if (t.alignment === cog) return true;
  for (const n of neighbors(t.hex)) {
    const nt = state.tiles[key(n)];
    if (nt !== undefined && nt.alignment === cog) return true;
  }
  return false;
}
