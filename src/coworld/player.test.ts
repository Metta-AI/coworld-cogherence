import { describe, it, expect } from "vitest";
import { newGame } from "../shared/engine/game";
import type { ToolUseClient, ConverseResult } from "../agents/llm/tool-client";
import type { GameToPlayer, PlayerView } from "./protocol";
import { reply } from "./player";

function viewFor(): PlayerView {
  const state = newGame(7, 3);
  return { state, me: state.cogOrder[0]!, messages: [] };
}

/** A client that answers with a single tool_use block. */
const toolClient = (name: string, input: unknown): ToolUseClient => ({
  async converse(): Promise<ConverseResult> {
    return { stopReason: "tool_use", content: [{ type: "tool_use", id: "t1", name, input }] };
  },
});

/** A client whose call fails (e.g. no Bedrock creds). */
const brokenClient: ToolUseClient = {
  async converse(): Promise<ConverseResult> {
    throw new Error("no credentials");
  },
};

describe("reference player reply()", () => {
  it("turns a commit frame into commit_result orders from the model's submit_orders", async () => {
    const msg: GameToPlayer = { type: "commit", turn: 1, view: viewFor() };
    const out = await reply(msg, toolClient("submit_orders", { bid: 5 }));
    expect(out).toEqual({ type: "commit_result", turn: 1, orders: [{ type: "bid", energy: 5 }] });
  });

  it("turns a negotiate frame into negotiate_result posts from send_messages", async () => {
    const msg: GameToPlayer = { type: "negotiate", turn: 2, view: viewFor() };
    const out = await reply(msg, toolClient("send_messages", { messages: [{ to: "public", text: "hello" }] }));
    expect(out).toEqual({ type: "negotiate_result", turn: 2, posts: [{ to: "public", text: "hello" }] });
  });

  it("is fail-safe: a model error yields empty orders (passive play), never throws", async () => {
    const out = await reply({ type: "commit", turn: 3, view: viewFor() }, brokenClient);
    expect(out).toEqual({ type: "commit_result", turn: 3, orders: [] });
  });

  it("does not reply to hello or final", async () => {
    const hello: GameToPlayer = { type: "hello", slot: 0, you: "cog0", name: "P0", players: [], seed: 7, maxTurns: 10 };
    const final: GameToPlayer = { type: "final", results: { scores: [0, 0, 0], winner: null, turns: 0 } };
    expect(await reply(hello, brokenClient)).toBeNull();
    expect(await reply(final, brokenClient)).toBeNull();
  });
});
