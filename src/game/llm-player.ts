import { realpathSync } from "node:fs";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { OpenRouterLlmClient, robustDecide } from "@cogweb/llm";
import { runCoworldPlayer, type PlayerDecideContext } from "@cogweb/coworld";
import { renderSpeechMessages, normalizePosts } from "./speech.js";
import {
  cogherenceModule,
  cogherenceGame,
  renderPlayerMessages,
  type CoghereSeamState,
  type CoghereDecision,
  type CoghereView,
} from "./game.js";

type Context = PlayerDecideContext<CoghereSeamState, CoghereDecision, CoghereView>;
export function makeLlmDecide(client = new OpenRouterLlmClient({ prefix: "COGHERENCE" })) {
  return (ctx: Context) => {
    const state = ctx.view as unknown as CoghereSeamState;
    const messages = renderPlayerMessages(ctx.view, ctx.seat, ctx.reason, "", ctx.messages);
    return robustDecide({
      client,
      purpose: { kind: "learner" },
      signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(client.timeoutMs)]),
      slot: ctx.playerSlot,
      system: messages[0]!.content,
      renderUser: (rejection) => messages[1]!.content + (rejection ? `\n\n${rejection}` : ""),
      validate: (candidate) => cogherenceGame.decisionSchema(state, ctx.seat).parse(candidate),
      baseline: () => cogherenceGame.baselineDecision(state, ctx.seat),
      recordAttempt: ctx.recordAttempt,
      markFallback: ctx.markFallback,
    });
  };
}
export function makeLlmTalk(client = new OpenRouterLlmClient({ prefix: "COGHERENCE" })) {
  const talkedThrough = new Map<number, number>();
  return async (ctx: Context) => {
    if ((talkedThrough.get(ctx.seat) ?? -1) >= ctx.turn) return [];
    talkedThrough.set(ctx.seat, ctx.turn);
    const messages = renderSpeechMessages(ctx.view, ctx.seat, ctx.messages);
    const result = await robustDecide({
      client,
      purpose: { kind: "learner" },
      signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(client.timeoutMs)]),
      slot: ctx.playerSlot,
      system: messages[0]!.content,
      renderUser: () => messages[1]!.content,
      validate: (candidate) => ({ messages: normalizePosts(candidate, ctx.view, ctx.seat) }),
      baseline: () => ({ messages: [] }),
      recordAttempt: ctx.recordAttempt,
      markFallback: ctx.markFallback,
      maxAttempts: 1,
    });
    return result.messages;
  };
}
export function run() {
  return runCoworldPlayer({
    module: cogherenceModule,
    decide: makeLlmDecide(),
    talk: makeLlmTalk(),
  });
}
if (realpathSync(argv[1]!) === fileURLToPath(import.meta.url)) await run();
