// `serve` entry: start the live server with scripted (or llm) agents and print
// the URLs. Run via `npm run serve -- --seed 7 --cogs 4 --agents greedy,...`.
import { buildAgents } from "./cli";
import { startServer } from "./server/runtime";

const arg = (name: string, dflt: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : dflt;
};

const ROTATION = ["greedy", "peaceful", "random", "greedy"];

async function main(): Promise<void> {
  const seed = Number(arg("seed", "7"));
  const cogs = Number(arg("cogs", "4"));
  const port = Number(arg("port", "8080"));
  const deadlineMs = Number(arg("deadline", "20000"));
  const minTurnMs = Number(arg("pace", "800"));
  const agentsArg = arg("agents", "");
  const specs = agentsArg
    ? agentsArg.split(",").map((s) => s.trim())
    : Array.from({ length: Math.max(1, cogs) }, (_, i) => ROTATION[i % ROTATION.length]!);

  const agents = buildAgents(specs, seed);
  const h = await startServer({ seed, agents, port, deadlineMs, minTurnMs, autorun: true });
  console.log(`Cogherence live — seed ${seed}, agents [${specs.join(", ")}]`);
  console.log(`  server:   ${h.url}`);
  console.log(`  viewer:   ${h.url}/?live`);
  console.log(`  globalws: ws://127.0.0.1:${h.port}/global/ws`);
}

main();
