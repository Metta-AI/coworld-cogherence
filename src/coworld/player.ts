// The reference player's decision logic, separate from the entrypoint so it is
// importable in tests without opening a socket. There is no negotiate phase. On
// each `commit` the player makes TWO focused, CONCURRENT model calls:
//   - decideOrders: orders only (submit_orders), retry on a missing/illegal
//     submission, scripted greedy fallback so the Cog always acts.
//   - decideChat:   chat only (send_messages), fail-safe to silence.
// Two focused calls reliably do BOTH (a single combined call tends to do one and
// neglect the other), and the entrypoint sends each result independently — so
// orders still meet the commit deadline while chat flows asynchronously.
import type { Order } from "../shared/engine/orders";
import type { Post } from "../agents/types";
import type { AgentView } from "../agents/types";
import { robustOrders, llmNegotiate } from "../agents/llm/llm-agent";
import { BedrockToolUseClient, bedrockConfigFromEnv, type ToolUseClient } from "../agents/llm/tool-client";

/** This turn's orders — robust (retry + scripted greedy fallback). */
export async function decideOrders(view: AgentView, client: ToolUseClient, persona?: string): Promise<Order[]> {
  return (await robustOrders(view, client, { persona })).orders;
}

/** This turn's chat (public + DMs); fail-safe to no messages. */
export async function decideChat(view: AgentView, client: ToolUseClient, persona?: string): Promise<Post[]> {
  return llmNegotiate(view, client, { persona });
}

/** Surface (don't hide) Bedrock failures: robustOrders/llmNegotiate catch and
 *  degrade gracefully, which hides a misconfigured model/region/credentials.
 *  This logs the real error to stderr (captured in policy-logs) before rethrowing. */
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

/** A Bedrock client from env (`coworld upload-policy --bedrock-model` → BEDROCK_MODEL). */
export function makeClient(): ToolUseClient {
  const cfg = bedrockConfigFromEnv();
  const model = process.env.BEDROCK_MODEL ?? cfg.model;
  console.log(`[bedrock] model=${model} region=${cfg.region} USE_BEDROCK=${process.env.USE_BEDROCK ?? "(unset)"}`);
  return loggingClient(new BedrockToolUseClient({ model, region: cfg.region, timeoutMs: cfg.timeoutMs }));
}
