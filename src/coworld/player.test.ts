import { describe, it, expect } from "vitest";
import { newGame } from "../shared/engine/game";
import type { ToolUseClient, ConverseResult, ContentBlock } from "../agents/llm/tool-client";
import type { GameToPlayer, PlayerView } from "./protocol";
import { reply, act } from "./player";

function viewFor(): PlayerView {
  const state = newGame(7, 3);
  return { state, me: state.cogOrder[0]!, messages: [] };
}

/** A client returning the given tool_use blocks. */
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
  it("act() returns both orders and posts from one call (parallel tools)", async () => {
    const c = client(tool("submit_orders", { bid: 4 }), tool("send_messages", { messages: [{ to: "public", text: "hi" }] }));
    const out = await act(viewFor(), c);
    expect(out.orders).toEqual([{ type: "bid", energy: 4 }]);
    expect(out.posts).toEqual([{ to: "public", text: "hi" }]);
  });

  it("a commit yields a commit_result plus an async message frame per post", async () => {
    const c = client(tool("submit_orders", { bid: 2 }), tool("send_messages", { messages: [{ to: "cog1", text: "deal?" }] }));
    const frames = await reply({ type: "commit", turn: 5, view: viewFor() }, c);
    expect(frames).toEqual([
      { type: "commit_result", turn: 5, orders: [{ type: "bid", energy: 2 }] },
      { type: "message", to: "cog1", text: "deal?" },
    ]);
  });

  it("a commit with only orders yields just the commit_result", async () => {
    const frames = await reply({ type: "commit", turn: 1, view: viewFor() }, client(tool("submit_orders", { bid: 1 })));
    expect(frames).toEqual([{ type: "commit_result", turn: 1, orders: [{ type: "bid", energy: 1 }] }]);
  });

  it("is fail-safe: a model error falls back to a scripted greedy move, never throws", async () => {
    const frames = await reply({ type: "commit", turn: 3, view: viewFor() }, broken);
    expect(frames).toHaveLength(1);
    const cr = frames[0]!;
    expect(cr.type).toBe("commit_result");
    expect(cr.type === "commit_result" && cr.turn).toBe(3);
    expect(cr.type === "commit_result" && cr.orders.length).toBeGreaterThan(0); // greedy fallback, not passive
  });

  it("does not reply to hello, message pushes, or final", async () => {
    const hello: GameToPlayer = { type: "hello", slot: 0, you: "cog0", name: "P0", players: [], seed: 7, maxTurns: 10 };
    const push: GameToPlayer = { type: "message", message: { seq: 1, turn: 1, from: "cog1", to: "public", text: "hey" } };
    const final: GameToPlayer = { type: "final", results: { scores: [0, 0, 0], winner: null, turns: 0 } };
    expect(await reply(hello, broken)).toEqual([]);
    expect(await reply(push, broken)).toEqual([]);
    expect(await reply(final, broken)).toEqual([]);
  });
});
