// Native Anthropic Messages tool calls through Coworld or local OpenRouter.
import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming, MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { MessagesClient } from "@cogweb/llm";

/** A tool the model may call. `inputSchema` is a JSON Schema object. */
export type ToolDef = { name: string; description: string; inputSchema: object };

/** A block of assistant output: text or a request to call a tool. */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

/** One message in the conversation transcript. */
export type ConvMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

export interface LlmResult {
  stopReason: "tool_use" | "end_turn" | "max_tokens" | string;
  content: ContentBlock[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ToolUseClient {
  complete(req: {
    system: string;
    slot: number;
    messages: ConvMessage[];
    tools: ToolDef[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<LlmResult>;
}

export class NativeToolUseClient implements ToolUseClient {
  private readonly client: MessagesClient;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly hosted: boolean;

  constructor(opts: { client?: MessagesClient; model?: string; timeoutMs?: number } = {}) {
    const endpoint = process.env.COWORLD_LLM_ENDPOINT;
    this.hosted = Boolean(endpoint);
    this.model = (endpoint ? process.env.COWORLD_LLM_MODEL : undefined)
      ?? opts.model ?? process.env.COGHERENCE_COG_MODEL ?? "anthropic/claude-haiku-4.5";
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.COGHERENCE_LLM_TIMEOUT_MS ?? 30000);
    this.client = opts.client ?? new Anthropic({
      baseURL: endpoint ?? "https://openrouter.ai/api",
      apiKey: null,
      authToken: endpoint ? "hosted-gateway" : process.env.OPENROUTER_API_KEY,
      maxRetries: 0,
      timeout: this.timeoutMs,
    }).messages;
  }

  async complete(req: Parameters<ToolUseClient["complete"]>[0]): Promise<LlmResult> {
    const body: MessageCreateParamsNonStreaming = {
      model: this.model,
      system: req.system,
      messages: req.messages as MessageParam[],
      max_tokens: req.maxTokens ?? 1024,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.tools.length ? { tools: req.tools.map((tool) => ({
        name: tool.name, description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Messages.Tool["input_schema"],
      })) } : {}),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.client.create(body, {
        signal: controller.signal,
        headers: this.hosted ? { "X-Coworld-Player-Slot": String(req.slot) } : {},
      });
      return {
        stopReason: response.stop_reason ?? "end_turn",
        content: response.content.flatMap((block): ContentBlock[] =>
          block.type === "text" ? [{ type: "text", text: block.text }]
          : block.type === "tool_use" ? [{ type: "tool_use", id: block.id, name: block.name, input: block.input }]
          : []),
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
