// A tool-use seam over Bedrock's Anthropic messages API. `converse` does one
// request/response with tool definitions; the model may answer with tool_use
// blocks. Tests inject a fake `send`, so they make NO real AWS calls. Mirrors
// cogame-polis's controllers/tool-client.ts.
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

/** A tool the model may call. `inputSchema` is a JSON Schema object. */
export type ToolDef = { name: string; description: string; inputSchema: object };

/** A block of assistant output: text or a request to call a tool. */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

/** One message in the conversation transcript. */
export type ConvMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

export interface ConverseResult {
  stopReason: "tool_use" | "end_turn" | "max_tokens" | string;
  content: ContentBlock[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ToolUseClient {
  converse(req: {
    system: string;
    messages: ConvMessage[];
    tools: ToolDef[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<ConverseResult>;
}

/** Minimal Bedrock surface used here (only `send`) — lets tests inject a fake. */
export interface BedrockSend {
  send(cmd: InvokeModelCommand, opts: { abortSignal: AbortSignal }): Promise<{ body: Uint8Array }>;
}

const DEFAULT_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const DEFAULT_REGION = "us-west-2";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.7;

export interface BedrockConfig {
  model: string;
  region: string;
  timeoutMs: number;
}
/** Resolve model/region/timeout from env (never read env deep inside libraries). */
export function bedrockConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BedrockConfig {
  return {
    model: env.COGHERENCE_COG_MODEL ?? DEFAULT_MODEL,
    region: env.COGHERENCE_BEDROCK_REGION ?? env.AWS_REGION ?? DEFAULT_REGION,
    timeoutMs: Number(env.COGHERENCE_BEDROCK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  };
}

interface AnthropicResponse {
  stop_reason?: string;
  content?: Array<{ type?: string; text?: string; id?: string; name?: string; input?: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function fromWire(content: AnthropicResponse["content"]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const b of content ?? []) {
    if (b.type === "text" && typeof b.text === "string") blocks.push({ type: "text", text: b.text });
    else if (b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string")
      blocks.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
  }
  return blocks;
}

export class BedrockToolUseClient implements ToolUseClient {
  private readonly client: BedrockSend;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: { client?: BedrockSend; model?: string; region?: string; timeoutMs?: number } = {}) {
    const cfg = bedrockConfigFromEnv();
    const region = opts.region ?? cfg.region;
    this.client = opts.client ?? (new BedrockRuntimeClient({ region }) as unknown as BedrockSend);
    this.model = opts.model ?? cfg.model;
    this.timeoutMs = opts.timeoutMs ?? cfg.timeoutMs;
  }

  async converse(req: {
    system: string;
    messages: ConvMessage[];
    tools: ToolDef[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<ConverseResult> {
    const body: Record<string, unknown> = {
      anthropic_version: "bedrock-2023-05-31",
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: req.temperature ?? DEFAULT_TEMPERATURE,
    };
    if (req.tools.length > 0) {
      body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    }

    const command = new InvokeModelCommand({
      modelId: this.model,
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(JSON.stringify(body)),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.client.send(command, { abortSignal: controller.signal });
      const parsed = JSON.parse(new TextDecoder().decode(response.body)) as AnthropicResponse;
      const result: ConverseResult = { stopReason: parsed.stop_reason ?? "end_turn", content: fromWire(parsed.content) };
      if (parsed.usage) {
        result.usage = { inputTokens: parsed.usage.input_tokens ?? 0, outputTokens: parsed.usage.output_tokens ?? 0 };
      }
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
}
