// The concrete per-episode game config the runner injects at COGAME_CONFIG_URI,
// validated at the boundary (fail loud). `tokens` is the runner-injected
// fixed-length slot array; `players[].name` are the resolved display names
// (hosted dispatch overwrites them). The rest are Cogherence game knobs. This
// mirrors the manifest's game.config_schema.
import { z } from "zod";

export const gameConfigSchema = z
  .object({
    /** One opaque token per player slot — its length defines the slot count. */
    tokens: z.array(z.string().min(1)).min(3).max(6),
    /** One display name per slot (slot-ordered). */
    players: z.array(z.object({ name: z.string().min(1) }).strict()).min(3).max(6),
    seed: z.number().int().default(7),
    max_turns: z.number().int().min(1).max(1000),
    /** Per-phase wall-clock budget (negotiate window, then commit window). */
    deadline_ms: z.number().int().min(0).default(15_000),
    /** Cheap-talk rounds per turn (0 disables negotiation entirely). */
    negotiate_rounds: z.number().int().min(0).max(5).default(1),
    /** Start the episode after this long even if not every slot connected. */
    player_connect_timeout_seconds: z.number().min(0).default(180),
  })
  .strict()
  .refine((c) => c.tokens.length === c.players.length, {
    message: "tokens and players must have the same length",
  });

export type GameConfig = z.infer<typeof gameConfigSchema>;
