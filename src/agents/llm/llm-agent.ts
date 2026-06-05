// The LLM Cog policy: render the view -> one tool-use turn offering submit_orders
// -> parse the tool call into Order[]. This is the one sanctioned FAIL-SAFE path:
// any error, missing tool call, or malformed input yields [] (no orders, bid 0),
// so a flaky model never throws or stalls a game (design §14.3).
import type { Agent, AgentView } from "../types";
import type { CogId } from "../../shared/engine/types";
import type { Order } from "../../shared/engine/orders";
import { renderView } from "./render";
import { SUBMIT_ORDERS_TOOL, parseSubmit } from "./submit";
import type { ToolUseClient } from "./tool-client";

/** Receives the act-prompt: what the model saw (the user prompt) + its decision. */
export type ReportFn = (turn: number, content: string) => void;

/** Ask the model for this turn's orders. Never throws — returns [] on any failure.
 *  If `opts.report` is given, it receives the prompt the model saw + the decision
 *  (the act-prompt transparency record), even on a failed/empty decision. */
export async function llmDecide(
  view: AgentView,
  client: ToolUseClient,
  opts?: { report?: ReportFn },
): Promise<Order[]> {
  const { system, user } = renderView(view);
  const report = (orders: Order[], note?: string): void =>
    opts?.report?.(view.state.turn, `${user}\n\n→ ${note ?? `decided: ${JSON.stringify(orders)}`}`);

  let reply;
  try {
    reply = await client.converse({ system, messages: [{ role: "user", content: user }], tools: [SUBMIT_ORDERS_TOOL] });
  } catch {
    report([], "no decision (model error/timeout) → no orders, bid 0");
    return []; // timeout / network / API error -> no orders, bid 0
  }
  const call = reply.content.find((b) => b.type === "tool_use" && b.name === SUBMIT_ORDERS_TOOL.name);
  if (!call || call.type !== "tool_use") {
    report([], "no submit_orders call → no orders, bid 0");
    return []; // model didn't submit
  }
  const orders = parseSubmit(call.input);
  report(orders);
  return orders;
}

/** An Agent backed by an LLM: each turn it renders the view, asks the model, and
 *  returns the parsed orders. `opts.report` surfaces the act-prompt (transparency). */
export function llmAgent(id: CogId, client: ToolUseClient, opts?: { report?: ReportFn }): Agent {
  return { id, commit: (view) => llmDecide(view, client, opts) };
}
