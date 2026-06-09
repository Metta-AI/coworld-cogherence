// A thin CLI that runs a full Cogherence game with scripted stub agents and
// prints a per-turn summary (sampled turns: turn, per-cog hearts) plus
// the final winner/standings, optionally dumping the full turn log to JSON. The
// logic is factored into testable exports (parseArgs, buildAgents, playGame,
// summarize); main() only runs when this file is the entry point, so importing
// it from tests has no side effects.

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { runGame } from "./shared/engine/game";
import { makeReplay, type Replay } from "./shared/replay";
import { greedyAgent, peacefulAgent, randomAgent } from "./agents/stub";
import { llmAgent } from "./agents/llm/llm-agent";
import { BedrockToolUseClient, type ToolUseClient } from "./agents/llm/tool-client";
import type { Agent } from "./agents/types";
import type { ActPromptEntry } from "./server/act-prompt-hub";
import type { GameState, CogId } from "./shared/engine/types";

/** Parsed CLI options. */
export interface CliOptions {
  seed: number;
  agents: string[];
  out?: string;
  every: number;
  turns?: number;
}

const ROTATION = ["greedy", "peaceful", "random", "greedy"];

/** Parse argv pairs like ["--seed","9","--agents","greedy,peaceful","--out","log.json"]. */
export function parseArgs(argv: string[]): CliOptions {
  let seed = 7;
  let agents: string[] | null = null;
  let cogs: number | null = null;
  let out: string | undefined;
  let every = 10;
  let turns: number | undefined;
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const val = argv[i + 1];
    if (val === undefined) break;
    if (key === "--seed") seed = Number(val);
    else if (key === "--cogs") cogs = Number(val);
    else if (key === "--agents") agents = val.split(",").map((s) => s.trim());
    else if (key === "--out") out = val;
    else if (key === "--every") every = Number(val);
    else if (key === "--turns") turns = Number(val);
  }
  if (!agents) {
    const n = Math.max(1, cogs ?? ROTATION.length);
    agents = Array.from({ length: n }, (_, i) => ROTATION[i % ROTATION.length]!);
  }
  return { seed, agents, out, every: Math.max(1, every), turns };
}

/** Build one agent per spec (ids cog0..cogN). Random agents are seeded off the game
 *  seed. `opts.persona(id)` (optional) is read each turn so a live operator can steer
 *  an LLM Cog mid-game; it's ignored by scripted agents. */
export function buildAgents(
  specs: string[],
  seed: number,
  opts?: { onActPrompt?: (e: ActPromptEntry) => void; persona?: (id: CogId) => string },
): Agent[] {
  let toolClient: ToolUseClient | null = null;
  const llmClient = (): ToolUseClient => (toolClient ??= new BedrockToolUseClient());
  return specs.map((spec, i) => {
    const id: CogId = `cog${i}`;
    if (spec === "greedy") return greedyAgent(id);
    if (spec === "peaceful") return peacefulAgent(id);
    if (spec === "random") return randomAgent(id, seed * 1000 + i);
    if (spec === "llm")
      return llmAgent(id, llmClient(), {
        report: (turn, content) => opts?.onActPrompt?.({ cogId: id, turn, phase: "commit", content }),
        persona: opts?.persona ? () => opts.persona!(id) : undefined,
      });
    throw new Error(`unknown agent type: "${spec}" (expected greedy | peaceful | random | llm)`);
  });
}

/** Play a full game from options. numCogs is derived from the agent list. */
export async function playGame(opts: { seed: number; agents: string[]; turns?: number }): Promise<{
  state: GameState;
  winner: CogId | null;
  standings: Array<{ cog: CogId; hearts: number }>;
}> {
  const agents = buildAgents(opts.agents, opts.seed);
  return runGame(opts.seed, agents.length, agents, opts.turns);
}

/** Build a recorded replay for the given options (fresh agents; deterministic for scripted ones). */
export async function replayFromOpts(opts: { seed: number; agents: string[]; turns?: number }): Promise<Replay> {
  return makeReplay(opts.seed, opts.agents, buildAgents(opts.agents, opts.seed), opts.turns);
}

/** Compact per-turn (sampled every `every` turns) + final summary from a finished game. */
export function summarize(result: Awaited<ReturnType<typeof playGame>>, every = 10): string[] {
  const lines: string[] = [];
  const ids = result.state.cogOrder;
  for (const rec of result.state.log) {
    if (rec.turn === 1 || rec.turn % every === 0) {
      const hearts = ids.map((id) => `${id}:${rec.hearts[id] ?? 0}`).join(" ");
      lines.push(`turn ${String(rec.turn).padStart(3)}  ${hearts}`);
    }
  }
  lines.push(`winner: ${result.winner}  final ${result.standings.map((s) => `${s.cog}:${s.hearts}`).join(" ")}`);
  return lines;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  try {
    const result = await playGame(opts);
    console.log(`Cogherence — seed ${opts.seed}, agents [${opts.agents.join(", ")}]`);
    for (const line of summarize(result, opts.every)) console.log(line);
    if (opts.out) {
      const replay = await replayFromOpts(opts);
      writeFileSync(opts.out, JSON.stringify(replay, null, 2));
      console.log(`replay written to ${opts.out} (${replay.frames.length} frames)`);
    }
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// Run main() only when this file is the entry point (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
