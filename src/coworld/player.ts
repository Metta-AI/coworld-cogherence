// The reference player's decision logic, separate from the entrypoint so it is
// importable in tests without opening a socket. It delegates every decision to
// the existing Cogherence LLM agent (fail-safe: a model error → no orders, bid 0).
import { llmNegotiate, llmDecide } from "../agents/llm/llm-agent";
import { BedrockToolUseClient, bedrockConfigFromEnv, type ToolUseClient } from "../agents/llm/tool-client";
import type { GameToPlayer, PlayerToGame } from "./protocol";

/** Surface (don't hide) Bedrock failures: the LLM agent catches converse errors
 *  and plays passively so the episode still completes, which makes a misconfigured
 *  model/region/credentials look like a silent no-op. This wrapper logs the real
 *  error to the player's stderr (captured in policy-logs) before rethrowing, so a
 *  passive game is diagnosable instead of mysterious. */
export function loggingClient(inner: ToolUseClient): ToolUseClient {
  let logged = 0;
  return {
    async converse(req) {
      try {
        return await inner.converse(req);
      } catch (e) {
        if (logged < 3) {
          logged++;
          console.error(`[bedrock] converse failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
        }
        throw e;
      }
    },
  };
}

/** Decide the reply (if any) to one game→player frame. hello/final → no reply. */
export async function reply(msg: GameToPlayer, client: ToolUseClient, persona?: string): Promise<PlayerToGame | null> {
  if (msg.type === "negotiate") {
    const posts = await llmNegotiate(msg.view, client, { persona });
    return { type: "negotiate_result", turn: msg.turn, posts };
  }
  if (msg.type === "commit") {
    const orders = await llmDecide(msg.view, client, { persona });
    return { type: "commit_result", turn: msg.turn, orders };
  }
  return null;
}

/** A Bedrock client from env (`coworld upload-policy --bedrock-model` → BEDROCK_MODEL). */
export function makeClient(): ToolUseClient {
  const cfg = bedrockConfigFromEnv();
  const model = process.env.BEDROCK_MODEL ?? cfg.model;
  console.log(`[bedrock] model=${model} region=${cfg.region} USE_BEDROCK=${process.env.USE_BEDROCK ?? "(unset)"}`);
  return loggingClient(new BedrockToolUseClient({ model, region: cfg.region, timeoutMs: cfg.timeoutMs }));
}
