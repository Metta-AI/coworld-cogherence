// The LLM Cog policy: render the view -> one tool-use turn offering submit_orders
// -> parse the tool call into Order[]. This is the one sanctioned FAIL-SAFE path:
// any error, missing tool call, or malformed input yields [] (no orders, bid 0),
// so a flaky model never throws or stalls a game (design §14.3).
import type { AgentView } from "../types";
import type { Order } from "../../shared/engine/orders";
import { renderView } from "./render";
import { SUBMIT_ORDERS_TOOL, parseSubmit } from "./submit";
import type { ToolUseClient } from "./tool-client";

/** Ask the model for this turn's orders. Never throws — returns [] on any failure. */
export async function llmDecide(view: AgentView, client: ToolUseClient): Promise<Order[]> {
  const { system, user } = renderView(view);
  let reply;
  try {
    reply = await client.converse({
      system,
      messages: [{ role: "user", content: user }],
      tools: [SUBMIT_ORDERS_TOOL],
    });
  } catch {
    return []; // timeout / network / API error -> no orders, bid 0
  }
  const call = reply.content.find((b) => b.type === "tool_use" && b.name === SUBMIT_ORDERS_TOOL.name);
  if (!call || call.type !== "tool_use") return []; // model didn't submit
  return parseSubmit(call.input);
}
