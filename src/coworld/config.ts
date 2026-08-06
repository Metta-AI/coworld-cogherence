// The per-episode coworld config the platform injects at `COGAME_CONFIG_URI`.
// The shape mirrors `src/game/coworld.ts`'s `config_schema` (the manifest
// contract). This package is the FIXED 4-SEAT Cogherence coworld (the engine
// supports 3–6 seats; a 3- or 6-player game is a separate coworld built from the
// same image): the runner injects one `tokens` entry per slot (length = the 4
// seats), and the platform overwrites `players[].name` with the seated
// policy/player names at dispatch (the standard `game_config_with_named_players`
// convention) so replays and the live roster show who is actually playing.
// `seed` is OPTIONAL: present → a reproducible board (the cert fixture pins one);
// absent → a fresh random board each episode (the league default). cogherence has
// no per-episode rounds/tax knobs — `MAX_TURNS` is a constant in
// `src/shared/engine/constants.ts`.
import { z } from "zod";

/** The fixed seat count of this coworld package. */
export const COWORLD_SEATS = 4;

export const coworldConfigSchema = z
  .object({
    tokens: z.array(z.string().min(1)).min(COWORLD_SEATS).max(COWORLD_SEATS),
    // The league ladder injects num_agents (= the fixed seat count) into every
    // episode's game_config to size the round; the host itself is fixed at 4
    // seats, so it only has to TOLERATE the key (a .strict() schema without it
    // crashes the host on every league episode).
    num_agents: z.literal(COWORLD_SEATS).optional(),
    players: z.array(z.object({ name: z.string().min(1) }).strict()).length(COWORLD_SEATS),
    seed: z.number().int().optional(),
  })
  .strict();

export type CoworldConfig = z.infer<typeof coworldConfigSchema>;
