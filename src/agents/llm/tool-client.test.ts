import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeToolUseClient } from "./tool-client";

afterEach(() => vi.unstubAllEnvs());

describe("NativeToolUseClient", () => {
  it("uses native tools, the injected model, and the acting seat over HTTP", async () => {
    const calls: Array<{ path: string; slot: string; body: Record<string, any> }> = [];
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      calls.push({ path: req.url!, slot: String(req.headers["x-coworld-player-slot"]),
        body: JSON.parse(Buffer.concat(chunks).toString()) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_test", type: "message", role: "assistant",
        model: "anthropic/claude-sonnet-4.6", stop_reason: "tool_use", stop_sequence: null,
        content: [{ type: "tool_use", id: "t1", name: "submit_orders", input: { bid: 3 } }],
        usage: { input_tokens: 5, output_tokens: 2 } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing listening port");
    vi.stubEnv("COWORLD_LLM_ENDPOINT", `http://127.0.0.1:${address.port}`);
    vi.stubEnv("COWORLD_LLM_MODEL", "anthropic/claude-sonnet-4.6");
    try {
      const client = new NativeToolUseClient({ model: "retired-local-model" });
      const result = await client.complete({ system: "rules", slot: 2,
        messages: [{ role: "user", content: "state" }],
        tools: [{ name: "submit_orders", description: "orders", inputSchema: { type: "object" } }] });
      expect(result.stopReason).toBe("tool_use");
      expect(result.content[0]).toMatchObject({ type: "tool_use", name: "submit_orders", input: { bid: 3 } });
      expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe("/v1/messages");
    expect(calls[0]!.slot).toBe("2");
    expect(calls[0]!.body.model).toBe("anthropic/claude-sonnet-4.6");
    expect(calls[0]!.body.anthropic_version).toBeUndefined();
    expect(calls[0]!.body.tools[0].name).toBe("submit_orders");
  });
});
