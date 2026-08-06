// The cogherence certification baseline player, on the shared @cogweb/coworld
// runtime. A websocket CLIENT of the game's `/player` server: on each
// `observation` it returns `cogherenceGame.baselineDecision` — an always-legal,
// no-LLM move (an empty order set: no orders, no bid, a legal hold for any seat
// any turn). This is what certifies a full episode offline.
//
//   COWORLD_PLAYER_WS_URL=ws://… npx tsx src/game/baseline-player.ts
//
// `runCoworldPlayer` defaults `connect` to COWORLD_PLAYER_WS_URL (already
// carrying ?slot=&token=), so no URL plumbing here.

import { argv } from "node:process";
import { fileURLToPath } from "node:url";

import { runCoworldPlayer } from "@cogweb/coworld";
import type { PlayerDecideContext } from "@cogweb/coworld";

import { cogherenceModule } from "./game.js";
import type { CoghereSeamState, CoghereDecision, CoghereView } from "./game.js";

/** `baselineDecision` reads neither the state nor the seat (it always holds with
 *  an empty order set), so the redacted per-seat view is a sufficient stand-in
 *  for the seam state it nominally expects. */
export function decide(ctx: PlayerDecideContext<CoghereSeamState, CoghereDecision, CoghereView>): CoghereDecision {
  return cogherenceModule.game.baselineDecision(ctx.view as unknown as CoghereSeamState, ctx.seat);
}

/** Connect a baseline slot and play to the episode's `final`. */
export function run(): Promise<number[]> {
  return runCoworldPlayer<CoghereSeamState, CoghereDecision, CoghereView>({
    module: cogherenceModule,
    decide,
  });
}

// Run only when invoked as the entrypoint (`npx tsx src/game/baseline-player.ts`),
// not when imported (e.g. by tests reusing `decide`).
if (argv[1] === fileURLToPath(import.meta.url)) {
  await run();
}
