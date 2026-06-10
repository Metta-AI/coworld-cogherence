// The single wire/replay contract: a finished game (recorded ServerMessage[])
// and a live game (phase-3 ws broadcast) speak the SAME discriminated union.
// Snapshots are full state; events mirror the engine's ResolveEvent | UpkeepEvent.
import { z } from "zod";

export const mineralSchema = z.enum(["C", "O", "Ge", "S"]);
const phaseSchema = z.enum(["negotiate", "commit", "resolve", "auction", "upkeep"]);
const treasurySchema = z
  .object({ C: z.number().int(), O: z.number().int(), Ge: z.number().int(), S: z.number().int() })
  .strict();
const cogIdNullable = z.string().nullable();

const tileSnapshotSchema = z
  .object({
    q: z.number().int(),
    r: z.number().int(),
    alignment: cogIdNullable,
    coherence: z.number().int(),
    mineral: mineralSchema,
    density: z.number(),
    density0: z.number(),
  })
  .strict();
const cogSnapshotSchema = z
  .object({
    id: z.string(),
    index: z.number().int(),
    hearts: z.number().int(),
    treasury: treasurySchema,
    energy: z.number().int(),
  })
  .strict();
export const gameSnapshotSchema = z
  .object({
    version: z.string(),
    seed: z.number(),
    turn: z.number().int(),
    phase: phaseSchema,
    radius: z.number().int(),
    coherenceMax: z.number().int(),
    tiles: z.array(tileSnapshotSchema),
    cogs: z.array(cogSnapshotSchema),
  })
  .strict();

const orderSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("align"), tile: z.string(), energy: z.number().int() }).strict(),
  z.object({ type: z.literal("exploit"), tile: z.string() }).strict(),
  z.object({ type: z.literal("abandon"), tile: z.string() }).strict(),
  z.object({ type: z.literal("transfer"), to: z.string(), mineral: mineralSchema, amount: z.number().int() }).strict(),
  z.object({ type: z.literal("bid"), energy: z.number().int() }).strict(),
]);

export const turnEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("order"), cog: z.string(), order: orderSchema }).strict(),
  z.object({ type: z.literal("rejected"), cog: z.string(), reason: z.string() }).strict(),
  z
    .object({ type: z.literal("transfer"), from: z.string(), to: z.string(), mineral: mineralSchema, amount: z.number().int() })
    .strict(),
  z.object({ type: z.literal("exploit"), cog: z.string(), tile: z.string(), mineral: mineralSchema, minted: z.number() }).strict(),
  z.object({ type: z.literal("abandon"), cog: z.string(), tile: z.string(), refund: z.number().int() }).strict(),
  z
    .object({ type: z.literal("capture"), tile: z.string(), from: cogIdNullable, to: cogIdNullable, coherence: z.number().int(), spent: z.number().int() })
    .strict(),
  z
    .object({
      type: z.literal("auction"),
      winner: cogIdNullable,
      price: z.number().int(),
      bids: z.array(z.tuple([z.string(), z.number().int()])),
    })
    .strict(),
  z.object({ type: z.literal("starved"), cog: z.string(), tile: z.string(), coherence: z.number().int() }).strict(),
  z.object({ type: z.literal("lost"), cog: z.string(), tile: z.string() }).strict(),
  z.object({ type: z.literal("mint"), cog: z.string(), gained: treasurySchema }).strict(),
  z.object({ type: z.literal("firstCommit"), cog: z.string(), reward: z.number().int() }).strict(),
]);

export const messageSchema = z
  .object({ seq: z.number().int(), turn: z.number().int(), from: z.string(), to: z.string(), text: z.string() })
  .strict();

export const serverStatusSchema = z
  .object({
    turn: z.number().int(),
    phase: phaseSchema,
    finished: z.boolean(),
    cogCount: z.number().int(),
    clientCount: z.number().int().default(0),
    pending: z.array(z.string()).default([]),
    done: z.array(z.string()).default([]),
    paused: z.boolean().optional(), // operator paused the live turn loop (older replays omit it)
    pausedAt: z.number().optional(), // epoch ms the current pause began (freezes the GAME clock)
    pausedAccumMs: z.number().optional(), // total ms paused so far (excluded from the GAME clock)
    phaseDeadlineAt: z.number().optional(),
    startedAt: z.number().optional(), // epoch ms the live game began — drives the header GAME clock
  })
  .strict();

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), snapshot: gameSnapshotSchema, backfill: z.boolean().optional() }).strict(),
  z.object({ type: z.literal("event"), event: turnEventSchema, turn: z.number().int() }).strict(),
  z.object({ type: z.literal("serverStatus"), status: serverStatusSchema }).strict(),
  z
    .object({ type: z.literal("actPrompt"), cogId: z.string(), turn: z.number().int(), phase: phaseSchema, content: z.string() })
    .strict(),
  z.object({ type: z.literal("message"), message: messageSchema }).strict(),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerStatus = z.infer<typeof serverStatusSchema>;
