import { describe, it, expect } from "vitest";
import { newGame } from "../shared/engine/game";
import type { AgentView } from "../agents/types";
import type { ToolUseClient, ConverseResult, ContentBlock } from "../agents/llm/tool-client";
import { decideOrders, decideChat } from "./player";

function viewFor(): AgentView {
  const state = newGame(7, 3);
  return { state, me: state.cogOrder[0]!, messages: [] };
}
const client = (...blocks: ContentBlock[]): ToolUseClient => ({
  async converse(): Promise<ConverseResult> {
    return { stopReason: "tool_use", content: blocks };
  },
});
const tool = (name: string, input: unknown): ContentBlock => ({ type: "tool_use", id: name, name, input });
const broken: ToolUseClient = {
  async converse(): Promise<ConverseResult> {
    throw new Error("no credentials");
  },
};

describe("reference player", () => {
  it("decideOrders parses submit_orders into Order[]", async () => {
    const orders = await decideOrders(viewFor(), client(tool("submit_orders", { aligns: [{ tile: "0,0", force: 2 }], bid: 3 })));
    expect(orders).toContainEqual({ type: "bid", energy: 3 });
  });

  it("decideOrders falls back to a scripted greedy move when the model fails (never passive)", async () => {
    const orders = await decideOrders(viewFor(), broken);
    expect(orders.length).toBeGreaterThan(0);
  });

  it("decideChat parses send_messages into posts", async () => {
    const posts = await decideChat(viewFor(), client(tool("send_messages", { messages: [{ to: "public", text: "hi" }] })));
    expect(posts).toEqual([{ to: "public", text: "hi" }]);
  });

  it("decideChat is fail-safe to silence on a model error", async () => {
    expect(await decideChat(viewFor(), broken)).toEqual([]);
  });
});
