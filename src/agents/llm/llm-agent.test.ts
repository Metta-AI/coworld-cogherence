import { describe, it, expect } from "vitest";
import { llmDecide } from "./llm-agent";
import type { ToolUseClient, ConverseResult } from "./tool-client";
import { newGame } from "../../shared/engine/game";

const view = { state: newGame(7, 4), me: "cog0" };
const fake = (r: ConverseResult | Error): ToolUseClient => ({
  converse: async () => {
    if (r instanceof Error) throw r;
    return r;
  },
});
const toolUse = (input: unknown): ConverseResult => ({
  stopReason: "tool_use",
  content: [{ type: "tool_use", id: "t1", name: "submit_orders", input }],
});

describe("llmDecide", () => {
  it("parses a submit_orders tool call into Order[]", async () => {
    const orders = await llmDecide(view, fake(toolUse({ aligns: [{ tile: "0,0", force: 2 }], bid: 4 })));
    expect(orders).toContainEqual({ type: "align", tile: "0,0", force: 2 });
    expect(orders).toContainEqual({ type: "bid", energy: 4 });
  });
  it("falls back to a scripted greedy move when the model emits no tool call", async () => {
    const orders = await llmDecide(view, fake({ stopReason: "end_turn", content: [{ type: "text", text: "hmm" }] }));
    expect(orders.length).toBeGreaterThan(0); // the Cog still acts (greedy), not passive
  });
  it("falls back to a scripted greedy move when the client throws (timeout / api error)", async () => {
    expect((await llmDecide(view, fake(new Error("timeout")))).length).toBeGreaterThan(0);
  });
  it("treats malformed tool input as an empty (hold) submission", async () => {
    expect(await llmDecide(view, fake(toolUse({ aligns: [{ tile: "0,0", force: -5 }] })))).toEqual([]);
  });
  it("reports the prompt + decision to the reporter", async () => {
    const reports: { turn: number; content: string }[] = [];
    const orders = await llmDecide(view, fake(toolUse({ aligns: [{ tile: "0,0", force: 2 }], bid: 4 })), {
      report: (turn, content) => reports.push({ turn, content }),
    });
    expect(orders).toContainEqual({ type: "bid", energy: 4 });
    expect(reports).toHaveLength(1);
    expect(reports[0]!.turn).toBe(1);
    expect(reports[0]!.content).toMatch(/Your treasury/); // the prompt the model saw
    expect(reports[0]!.content).toMatch(/bid/); // the decision summary
  });
  it("captures the retry + fallback transcript when the model emits no tool call", async () => {
    const reports: string[] = [];
    await llmDecide(view, fake({ stopReason: "end_turn", content: [{ type: "text", text: "hmm" }] }), {
      report: (_t, content) => reports.push(content),
      maxAttempts: 2,
    });
    expect(reports[0]).toMatch(/no submit_orders call/);
    expect(reports[0]).toMatch(/fell back to a scripted/);
  });
  it("retries with the engine's reason when orders would be rejected, then falls back", async () => {
    // An unaffordable bid (way over starting energy) is rejected by the dry-run.
    const reports: string[] = [];
    const orders = await llmDecide(view, fake(toolUse({ bid: 100000 })), {
      report: (_t, content) => reports.push(content),
      maxAttempts: 2,
    });
    expect(reports[0]).toMatch(/engine would reject/);
    expect(orders.length).toBeGreaterThan(0); // fell back to a legal greedy move
  });
});
