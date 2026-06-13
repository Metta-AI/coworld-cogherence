// The reference player's decision logic, separate from the entrypoint so it is
// importable in tests without opening a socket. It delegates every decision to
// the existing Cogherence LLM agent (fail-safe: a model error → no orders, bid 0).
import { llmNegotiate, llmDecide } from "../agents/llm/llm-agent";
import { BedrockToolUseClient, bedrockConfigFromEnv, type ToolUseClient } from "../agents/llm/tool-client";
import type { GameToPlayer, PlayerToGame } from "./protocol";

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
  return new BedrockToolUseClient({ model, region: cfg.region, timeoutMs: cfg.timeoutMs });
}
