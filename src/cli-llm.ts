// Demo entry: run ONE LLM decision against real Bedrock for a fresh game and
// print the model's raw output + the parsed orders. Proves the prompt pipeline
// end-to-end. Needs AWS credentials with Bedrock access (set AWS_PROFILE / AWS_REGION).
//   npm run dev:llm -- --seed 7 --cogs 4 --me cog0 --show-prompt
import { newGame } from "./shared/engine/game";
import { renderView } from "./agents/llm/render";
import { BedrockToolUseClient } from "./agents/llm/tool-client";
import { SUBMIT_ORDERS_TOOL, parseSubmit } from "./agents/llm/submit";

const arg = (name: string, dflt: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : dflt;
};
const has = (name: string): boolean => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  const seed = Number(arg("seed", "7"));
  const cogs = Number(arg("cogs", "4"));
  const me = arg("me", "cog0");
  const view = { state: newGame(seed, cogs), me };
  const { system, user } = renderView(view);

  if (has("show-prompt")) {
    console.log(`=== SYSTEM ===\n${system}\n\n=== USER ===\n${user}\n`);
  }

  const client = new BedrockToolUseClient();
  console.log(`Asking the model for ${me}'s orders (seed ${seed}, ${cogs} cogs)…\n`);
  const reply = await client.converse({
    system,
    messages: [{ role: "user", content: user }],
    tools: [SUBMIT_ORDERS_TOOL],
  });

  console.log(`stopReason: ${reply.stopReason}`);
  for (const b of reply.content) {
    if (b.type === "text") console.log(`\n[text]\n${b.text}`);
    else console.log(`\n[tool_use ${b.name}]\n${JSON.stringify(b.input, null, 2)}`);
  }
  const call = reply.content.find((b) => b.type === "tool_use" && b.name === SUBMIT_ORDERS_TOOL.name);
  const orders = call && call.type === "tool_use" ? parseSubmit(call.input) : [];
  console.log(`\nparsed orders (${orders.length}):\n${JSON.stringify(orders, null, 2)}`);
}

main();
