// The reference player's decision logic, separate from the entrypoint so it is
// importable in tests without opening a socket. There is no negotiate phase: on
// each `commit` the player makes ONE model call that may both submit orders AND
// send chat (parallel tool use), then emits a commit_result plus zero or more
// async `message` frames. Incoming message pushes need no reply — the next
// commit view carries the visible chat. Fail-safe: a model error → no orders,
// no messages, so the episode still completes.
import type { Order } from "../shared/engine/orders";
import type { Post } from "../agents/types";
import { renderView } from "../agents/llm/render";
import { SUBMIT_ORDERS_TOOL, parseSubmit } from "../agents/llm/submit";
import { SEND_MESSAGES_TOOL, parsePosts } from "../agents/llm/negotiate";
import { BedrockToolUseClient, bedrockConfigFromEnv, type ToolUseClient } from "../agents/llm/tool-client";
import type { GameToPlayer, PlayerToGame, PlayerView } from "./protocol";

/** One model call offering both tools: returns this turn's orders + any chat. */
export async function act(view: PlayerView, client: ToolUseClient, persona?: string): Promise<{ orders: Order[]; posts: Post[] }> {
  const { system, user } = renderView(view, persona);
  const prompt =
    `${user}\n\nYou may ALSO call send_messages to talk to other Cogs at any time — public broadcasts or DMs to a cog id — to form alliances, propose trades, bluff, or threaten. Nothing is binding. Messages are optional.`;
  let reply;
  try {
    reply = await client.converse({ system, messages: [{ role: "user", content: prompt }], tools: [SUBMIT_ORDERS_TOOL, SEND_MESSAGES_TOOL] });
  } catch {
    return { orders: [], posts: [] }; // fail-safe (e.g. no Bedrock creds) → passive
  }
  const orderCall = reply.content.find((b) => b.type === "tool_use" && b.name === SUBMIT_ORDERS_TOOL.name);
  const msgCall = reply.content.find((b) => b.type === "tool_use" && b.name === SEND_MESSAGES_TOOL.name);
  const orders = orderCall && orderCall.type === "tool_use" ? parseSubmit(orderCall.input) : [];
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
