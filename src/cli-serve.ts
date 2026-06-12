// `serve` entry: start the live server with scripted (or llm) agents and print
// the URLs. Run via `npm run serve -- --seed 7 --cogs 4 --agents greedy,...`.
import { execFile } from "node:child_process";
import { buildAgents } from "./cli";
import { startServer } from "./server/runtime";
import { ActPromptHub } from "./server/act-prompt-hub";
import { MessageBus } from "./server/message-bus";
import { SteeringStore, steerableAgent } from "./server/steering-store";

const arg = (name: string, dflt: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : dflt;
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const ROTATION = ["greedy", "peaceful", "random", "greedy"];

async function main(): Promise<void> {
  const seed = Number(arg("seed", "7"));
  const cogs = Number(arg("cogs", "4"));
  const port = Number(arg("port", "8080"));
  const deadlineMs = Number(arg("deadline", "20000"));
  const minTurnMs = Number(arg("pace", "800"));
  const maxTurns = Number(arg("turns", "0")) || undefined;
  const agentsArg = arg("agents", "");
  // --cogs 0 launches an EMPTY board: the loop idles until players claim in
  // via /cog/<name> (each claim seats a manual cog at a free corner).
  const specs = agentsArg
    ? agentsArg.split(",").map((s) => s.trim())
    : Array.from({ length: Math.max(0, cogs) }, (_, i) => ROTATION[i % ROTATION.length]!);
  // --names Alex,Dave seats the cogs under those names; --manual starts every
  // seat with autopilot OFF (operators drive via the Control panel / Ready).
  const names = arg("names", "") ? arg("names", "").split(",").map((s) => s.trim()) : undefined;
  const manual = flag("manual");
  // --wait-ready: turns never auto-advance — Commit waits for every cog's Ready.
  const waitForReady = flag("wait-ready");

  const hub = new ActPromptHub();
  const bus = new MessageBus();
  const steering = new SteeringStore();
  const agents = buildAgents(specs, seed, {
    onActPrompt: (e) => hub.record(e),
    persona: (id) => steering.persona(id),
  }).map((a) => steerableAgent(a, steering));
  if (manual) for (let i = 0; i < specs.length; i++) steering.update(`cog${i}`, { paused: true });
  const defaultLive = flag("default-live");
  // The SHARE link must be reachable by other machines: prefer the Tailscale
  // MagicDNS name (the host usually browses via localhost, which is useless to
  // copy). No tailscale -> null -> the client falls back to its own origin.
  const tailnetName = await new Promise<string | null>((res) => {
    execFile("tailscale", ["status", "--json"], (err, out) => {
      if (err) return res(null);
      const name = (JSON.parse(out) as { Self?: { DNSName?: string } }).Self?.DNSName;
      res(name ? name.replace(/\.$/, "") : null);
    });
  });
  const h = await startServer({
    seed, agents, port, deadlineMs, minTurnMs, maxTurns, turnLimit: 10, hub, bus, steering, agentSpecs: specs, names, waitForReady, defaultLive, autorun: true, dev: true,
    shareOrigin: tailnetName ? `http://${tailnetName}:${port}` : null,
  });
  console.log(`Cogherence live — seed ${seed}, agents [${specs.join(", ")}]`);
  console.log(`  server:   ${h.url}`);
  console.log(`  viewer:   ${h.url}/${defaultLive ? "" : "?live"}`);
  console.log(`  globalws: ws://127.0.0.1:${h.port}/global/ws`);
}

main();
