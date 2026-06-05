// Load + validate a recorded replay, and project it to the ordered snapshot list.
// Validation happens at this boundary: malformed input throws (fail loud).
import { z } from "zod";
import { serverMessageSchema } from "../shared/protocol";
import type { GameSnapshot } from "../shared/snapshot";

const replaySchema = z
  .object({
    meta: z
      .object({ version: z.string(), seed: z.number(), agents: z.array(z.string()), turns: z.number().int() })
      .strict(),
    frames: z.array(serverMessageSchema),
  })
  .strict();
export type Replay = z.infer<typeof replaySchema>;

/** Parse + validate raw JSON into a Replay. Throws on malformed input — intentional. */
export function parseReplay(raw: unknown): Replay {
  return replaySchema.parse(raw);
}

/** The ordered list of board snapshots (one per turn boundary). */
export function snapshots(replay: Replay): GameSnapshot[] {
  return replay.frames.flatMap((f) => (f.type === "snapshot" ? [f.snapshot] : []));
}
