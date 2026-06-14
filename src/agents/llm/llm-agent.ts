// The LLM Cog policy: render the view -> one tool-use turn offering submit_orders
// -> parse the tool call into Order[]. This is the one sanctioned FAIL-SAFE path:
// any error, missing tool call, or malformed input yields [] (no orders, bid 0),
// so a flaky model never throws or stalls a game (design §14.3).
import type { Agent, AgentView, Post } from "../types";
import type { CogId } from "../../shared/engine/types";
import type { Order } from "../../shared/engine/orders";
import { resolve } from "../../shared/engine/resolve";
import { greedyAgent } from "../stub";
import { renderView, renderNegotiate } from "./render";
import { SUBMIT_ORDERS_TOOL, parseSubmit } from "./submit";
import { SEND_MESSAGES_TOOL, parsePosts } from "./negotiate";
import type { ToolUseClient, ToolDef, ContentBlock } from "./tool-client";

/** Receives the act-prompt: what the model saw (the user prompt) + its decision. */
export type ReportFn = (turn: number, content: string) => void;

/** Ask the model for this turn's orders. Never throws — returns [] on any failure.
 *  If `opts.report` is given, it receives the prompt the model saw + the decision
 *  (the act-prompt transparency record), even on a failed/empty decision. */
/** Dry-run the order set against the engine on a CLONE (so it can never touch the
 *  live game); returns the engine's rejection reason, or null if it would accept. */
function rejectionReason(view: AgentView, orders: Order[]): string | null {
  const { events } = resolve(structuredClone(view.state), { [view.me]: orders });
  const rej = events.find((e) => e.type === "rejected" && e.cog === view.me);
  return rej && rej.type === "rejected" ? rej.reason : null;
}

/** The robust decide loop (ported from agricogla): up to `maxAttempts` model
 *  calls, retrying on a Bedrock error, a missing submit_orders call, or orders
 *  the engine would reject (re-prompting with the reason); then a scripted
 *  greedy fallback so the Cog ALWAYS acts instead of going passive. Captures the
 *  full transcript (prompt → model thoughts → tool input → retries → fallback)
 *  as the act-prompt content. `extraTools` offers extra tools (e.g. send_messages)
 *  whose calls the caller parses from the returned `content`. */
export async function robustOrders(
  view: AgentView,
  client: ToolUseClient,
  opts?: { persona?: string; report?: ReportFn; maxAttempts?: number; extraTools?: ToolDef[]; promptSuffix?: string },
): Promise<{ orders: Order[]; content: ContentBlock[] }> {
  const { system, user } = renderView(view, opts?.persona);
  const base = opts?.promptSuffix ? `${user}${opts.promptSuffix}` : user;
  const tools = [SUBMIT_ORDERS_TOOL, ...(opts?.extraTools ?? [])];
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 3);
  const transcript: string[] = [base];
  let userText = base;
  let lastContent: ContentBlock[] = [];
  const finish = (orders: Order[], content: ContentBlock[]): { orders: Order[]; content: ContentBlock[] } => {
    opts?.report?.(view.state.turn, transcript.join("\n\n"));
    return { orders, content };
  };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let reply;
    try {
      reply = await client.converse({ system, messages: [{ role: "user", content: userText }], tools });
    } catch (e) {
      transcript.push(`bedrock error: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    lastContent = reply.content;
    const text = reply.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
    if (text) transcript.push(`model: ${text}`);
    const call = reply.content.find((b) => b.type === "tool_use" && b.name === SUBMIT_ORDERS_TOOL.name);
    if (!call || call.type !== "tool_use") {
      transcript.push("no submit_orders call; retrying");
      userText = `${base}\n\nYou MUST call submit_orders exactly once (an empty order set is allowed — that holds).`;
      continue;
    }
    transcript.push(`submit_orders: ${JSON.stringify(call.input)}`);
    const orders = parseSubmit(call.input);
    const reason = rejectionReason(view, orders);
    if (reason) {
      transcript.push(`engine would reject: ${reason}`);
      userText = `${base}\n\nYour previous orders were REJECTED by the engine: ${reason}\nAn unaffordable set bounces WHOLESALE — fix it and call submit_orders again.`;
      continue;
    }
    transcript.push(`accepted: ${JSON.stringify(orders)}`);
    return finish(orders, reply.content);
  }
  // Every attempt failed — play a scripted greedy move so the Cog still acts.
  const fb = await Promise.resolve(greedyAgent(view.me).commit(view));
  transcript.push(`fell back to a scripted greedy move: ${JSON.stringify(fb)}`);
  return finish(fb, lastContent);
}

/** Ask the model for this turn's orders, robustly (retry + scripted fallback). */
export async function llmDecide(
  view: AgentView,
  client: ToolUseClient,
  opts?: { report?: ReportFn; persona?: string; maxAttempts?: number },
): Promise<Order[]> {
  return (await robustOrders(view, client, { persona: opts?.persona, report: opts?.report, maxAttempts: opts?.maxAttempts })).orders;
}

/** Ask the model for negotiation messages this turn. Never throws — returns []. */
export async function llmNegotiate(
  view: AgentView,
  client: ToolUseClient,
  opts?: { report?: ReportFn; persona?: string },
): Promise<Post[]> {
  const { system, user } = renderNegotiate(view, opts?.persona);
  let reply;
  try {
    reply = await client.converse({ system, messages: [{ role: "user", content: user }], tools: [SEND_MESSAGES_TOOL] });
  } catch {
    opts?.report?.(view.state.turn, `${user}\n\n→ (negotiation error) no messages`);
    return [];
  }
  const call = reply.content.find((b) => b.type === "tool_use" && b.name === SEND_MESSAGES_TOOL.name);
  const posts = call && call.type === "tool_use" ? parsePosts(call.input) : [];
  opts?.report?.(view.state.turn, `${user}\n\n→ sent: ${JSON.stringify(posts)}`);
  return posts;
}

/** An Agent backed by an LLM: negotiates (public/DM messages) then commits orders.
 *  `opts.report` surfaces the act-prompt (transparency). `opts.persona` is read
 *  every turn (a getter) so operator steering takes effect on the next decision. */
export function llmAgent(
  id: CogId,
  client: ToolUseClient,
  opts?: {
    report?: ReportFn;
    persona?: () => string;
    /** Per-turn model id (operator-selectable). Used with `clientFor`. */
    model?: () => string;
    /** Resolve a client for a model id (cached). When given with `model`, the
     *  agent picks the client per turn so a live model switch takes effect. */
    clientFor?: (model: string) => ToolUseClient;
  },
): Agent {
  const now = () => ({ report: opts?.report, persona: opts?.persona?.() });
  const pick = (): ToolUseClient => (opts?.clientFor && opts?.model ? opts.clientFor(opts.model()) : client);
  return {
    id,
    negotiate: (view) => llmNegotiate(view, pick(), now()),
    commit: (view) => llmDecide(view, pick(), now()),
  };
}
