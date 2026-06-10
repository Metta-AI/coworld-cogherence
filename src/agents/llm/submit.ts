// The `submit_orders` terminal tool: the JSON-Schema definition the model fills,
// a zod validator for its input, and a converter to the engine's Order[].
// Malformed input -> [] (no orders, bid 0): the agent never throws (design §14.3).
import { z } from "zod";
import { ALIGN_MAX_ENERGY } from "../../shared/engine/constants";
import { MINERALS } from "../../shared/engine/types";
import type { Order } from "../../shared/engine/orders";
import type { ToolDef } from "./tool-client";

const alignSchema = z.object({ tile: z.string(), energy: z.number().int().positive().max(ALIGN_MAX_ENERGY) });
const transferSchema = z.object({ to: z.string(), mineral: z.enum(MINERALS), amount: z.number().int().positive() });

export const submitOrdersSchema = z.object({
  thoughts: z.string().optional(),
  aligns: z.array(alignSchema).optional(),
  abandons: z.array(z.string()).optional(),
  exploits: z.array(z.string()).optional(),
  transfers: z.array(transferSchema).optional(),
  bid: z.number().int().nonnegative().optional(),
});
export type SubmitOrders = z.infer<typeof submitOrdersSchema>;

/** The tool the model calls exactly once to end its turn. */
export const SUBMIT_ORDERS_TOOL: ToolDef = {
  name: "submit_orders",
  description: "Submit your orders for this turn. Call this exactly once. Every field is optional — omit what you don't use.",
  inputSchema: {
    type: "object",
    properties: {
      thoughts: { type: "string", description: "Brief private reasoning (not shown to other Cogs)." },
      aligns: {
        type: "array",
        description:
          "Commit ENERGY (max 100) to a tile's tug-of-war. The force arriving = floor(sqrt(energy − distance²)), where distance is from your CLOSEST tile (your own tile = 0, adjacent = 1). 100e at distance 0 arrives as force 10. The full energy is charged win or lose; an align whose force fully dissipates is rejected. Target ANY tile.",
        items: {
          type: "object",
          properties: {
            tile: { type: "string", description: "tile key, e.g. '0,0' (axial q,r)" },
            energy: { type: "integer", minimum: 1, maximum: 100 },
          },
          required: ["tile", "energy"],
          additionalProperties: false,
        },
      },
      exploits: {
        type: "array",
        description: "Tile keys you own to strip-mine for a one-time windfall (the tile goes neutral and its density permanently drops).",
        items: { type: "string" },
      abandons: {
        type: "array",
        items: { type: "string" },
        description: "Tile keys you own to return to neutral — their standing coherence comes home as energy (next-turn money).",
      },
      },
      transfers: {
        type: "array",
        description: "Send minerals to another Cog (costs 1 energy each).",
        items: {
          type: "object",
          properties: {
            to: { type: "string", description: "recipient cog id, e.g. 'cog1'" },
            mineral: { type: "string", enum: [...MINERALS] },
            amount: { type: "integer", minimum: 1 },
          },
          required: ["to", "mineral", "amount"],
          additionalProperties: false,
        },
      },
      bid: { type: "integer", minimum: 0, description: "Sealed second-price heart bid, in energy (reserve price 1e — hearts are never free, and you must hold at least one tile to buy; tied bids go to whoever committed first). 0 = no bid." },
    },
    additionalProperties: false,
  },
};

/** Convert a validated payload into engine Order[]. */
export function toOrders(p: SubmitOrders): Order[] {
  const orders: Order[] = [];
  for (const a of p.aligns ?? []) orders.push({ type: "align", tile: a.tile, energy: a.energy });
  for (const t of p.abandons ?? []) orders.push({ type: "abandon", tile: t });
  for (const t of p.exploits ?? []) orders.push({ type: "exploit", tile: t });
  for (const tr of p.transfers ?? []) orders.push({ type: "transfer", to: tr.to, mineral: tr.mineral, amount: tr.amount });
  if (p.bid !== undefined && p.bid > 0) orders.push({ type: "bid", energy: p.bid });
  return orders;
}

/** Parse raw tool input into Order[]; returns [] (no orders, bid 0) on malformed input. */
export function parseSubmit(input: unknown): Order[] {
  const r = submitOrdersSchema.safeParse(input);
  if (!r.success) return [];
  return toOrders(r.data);
}
