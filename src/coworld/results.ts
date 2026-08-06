// The episode results artifact, matching `src/game/coworld.ts`'s
// `results_schema` (the manifest contract): one score (Hearts) per seat in seat
// order, plus an optional pointer to the saved replay. `writeResults` (from
// @cogweb/coworld) validates against this zod schema before writing it to
// `COGAME_RESULTS_URI`.
import { z } from "zod";

export const cogherenceResultsSchema = z
  .object({
    scores: z.array(z.number()),
    replayUri: z.string().optional(),
  })
  .strict();

export type CogherenceResults = z.infer<typeof cogherenceResultsSchema>;
