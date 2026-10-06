import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { runCoworldPlayer, type PlayerDecideContext } from "@cogweb/coworld";

import { candidates } from "./choices.js";
import { cogherenceModule, type CoghereDecision, type CoghereSeamState, type CoghereView } from "./game.js";
import { numericEncoding } from "./numeric-codec.js";

/** Query one frozen numeric policy, then submit complete ordinary orders. */
export function numericDecide(url: string, session: string) {
  return async (ctx: PlayerDecideContext<CoghereSeamState, CoghereDecision, CoghereView>): Promise<CoghereDecision> => {
    const choices = candidates(ctx.view, ctx.seat);
    const encoding = numericEncoding(ctx.view, ctx.seat, ctx.turn);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session,
        seat: ctx.seat,
        decision_id: ctx.turn,
        values: encoding.values,
        action_mask: encoding.actions.map((action) => action !== null),
      }),
      signal: AbortSignal.any([
        ctx.signal,
        AbortSignal.timeout(Math.max(1, Math.min(30_000, ctx.timeLeftMs ?? 30_000))),
      ]),
    });
    if (!response.ok) throw new Error(`Numeric policy returned HTTP ${response.status}`);
    const selected = z
      .object({
        choice: z
          .number()
          .int()
          .min(0)
          .max(choices.length - 1),
      })
      .strict()
      .parse(await response.json());
    return { orders: choices[selected.choice]!.orders };
  };
}

if (argv[1] === fileURLToPath(import.meta.url)) {
  const url = z.string().url().parse(process.env.PLAYER_NUMERIC_URL);
  const session = z.string().min(1).max(128).parse(process.env.PLAYER_POLICY_SESSION);
  await runCoworldPlayer({ module: cogherenceModule, decide: numericDecide(url, session) });
}
