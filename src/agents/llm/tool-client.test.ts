import { describe, it, expect } from "vitest";
import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { BedrockToolUseClient, bedrockConfigFromEnv, type BedrockSend } from "./tool-client";

function fakeSend(response: object): { client: BedrockSend; calls: InvokeModelCommand[] } {
  const calls: InvokeModelCommand[] = [];
  const client: BedrockSend = {
    async send(cmd) {
      calls.push(cmd);
      return { body: new TextEncoder().encode(JSON.stringify(response)) };
    },
  };
  return { client, calls };
}

describe("bedrockConfigFromEnv", () => {
  it("uses defaults, overridable by env", () => {
    expect(bedrockConfigFromEnv({}).model).toContain("claude");
    expect(bedrockConfigFromEnv({ COGHERENCE_BEDROCK_REGION: "eu-west-1" }).region).toBe("eu-west-1");
  });
});

describe("BedrockToolUseClient.converse", () => {
  it("parses a tool_use response", async () => {
    const { client } = fakeSend({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t1", name: "submit_orders", input: { bid: 3 } }],
    });
    const c = new BedrockToolUseClient({ client });
    const r = await c.converse({
      system: "rules",
      messages: [{ role: "user", content: "state" }],
      tools: [{ name: "submit_orders", description: "d", inputSchema: { type: "object" } }],
    });
    expect(r.stopReason).toBe("tool_use");
    expect(r.content[0]).toMatchObject({ type: "tool_use", name: "submit_orders", input: { bid: 3 } });
  });

  it("builds an Anthropic body with system, messages, and tools", async () => {
    const { client, calls } = fakeSend({ stop_reason: "end_turn", content: [{ type: "text", text: "hi" }] });
    const c = new BedrockToolUseClient({ client, model: "test-model" });
    await c.converse({
      system: "RULES",
      messages: [{ role: "user", content: "S" }],
      tools: [{ name: "submit_orders", description: "d", inputSchema: {} }],
    });
    const cmd = calls[0]!;
    expect(cmd.input.modelId).toBe("test-model");
    const body = JSON.parse(new TextDecoder().decode(cmd.input.body as Uint8Array));
    expect(body.anthropic_version).toBe("bedrock-2023-05-31");
    expect(body.system[0].text).toBe("RULES");
    expect(body.tools[0].name).toBe("submit_orders");
  });
});
