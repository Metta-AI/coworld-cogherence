// The reference player's decision logic, separate from the entrypoint so it is
// importable in tests without opening a socket. There is no negotiate phase: on
// each `commit` the player runs the shared robust decide loop (one model call
// offering submit_orders + send_messages; retry on a missing/illegal submission;
// scripted greedy fallback so the Cog always acts), then emits a commit_result
// plus zero or more async `message` frames. Incoming message pushes need no
// reply — the next commit view carries the visible chat.
import type { Order } from "../shared/engine/orders";
import type { Post } from "../agents/types";
import { robustOrders } from "../agents/llm/llm-agent";
import { SEND_MESSAGES_TOOL, parsePosts } from "../agents/llm/negotiate";
import { BedrockToolUseClient, bedrockConfigFromEnv, type ToolUseClient } from "../agents/llm/tool-client";
import type { GameToPlayer, PlayerToGame, PlayerView } from "./protocol";

const MESSAGE_SUFFIX =
  "\n\nYou may ALSO call send_messages to talk to other Cogs at any time — public broadcasts or DMs to a cog id — to form alliances, propose trades, bluff, or threaten. Nothing is binding. Messages are optional.";

/** Decide this turn's orders (robustly) + any chat, in one model call. */
export async function act(view: PlayerView, client: ToolUseClient, persona?: string): Promise<{ orders: Order[]; posts: Post[] }> {
  const { orders, content } = await robustOrders(view, client, { persona, extraTools: [SEND_MESSAGES_TOOL], promptSuffix: MESSAGE_SUFFIX });
  const msgCall = content.find((b) => b.type === "tool_use" && b.name === SEND_MESSAGES_TOOL.name);
  const posts = msgCall && msgCall.type === "tool_use" ? parsePosts(msgCall.input) : [];
  return { orders, posts };
}

/** The frames to send in response to one game→player frame. A `commit` yields a
 *  commit_result plus async message frames; hello/message/final yield nothing. */
export async function reply(msg: GameToPlayer, client: ToolUseClient, persona?: string): Promise<PlayerToGame[]> {
  if (msg.type !== "commit") return [];
  const { orders, posts } = await act(msg.view, client, persona);
  return [
    { type: "commit_result", turn: msg.turn, orders },
    ...posts.map((p): PlayerToGame => ({ type: "message", to: p.to, text: p.text })),
  ];
}

/** Surface (don't hide) Bedrock failures: the act() catch keeps play going on a
 *  model error, which makes a misconfigured model/region/credentials look like a
 *  silent no-op. This logs the real error before rethrowing so it's diagnosable. */
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
