// Wire the engine + runner + express + websockets into a running server.
// startServer returns a handle (url, port, runner, close); autorun kicks the live
// turn loop in the background (pass autorun:false in tests to keep it static).
import { createServer } from "node:http";
import type { Agent } from "../agents/types";
import { GameRunner } from "./game-runner";
import { createApp } from "./http";
import { attachWebsockets } from "./websocket";
import type { ActPromptHub } from "./act-prompt-hub";
import type { MessageBus } from "./message-bus";
import type { SteeringStore } from "./steering-store";

export interface ServerHandle {
  url: string;
  port: number;
  runner: GameRunner;
  close: () => Promise<void>;
}

export async function startServer(opts: {
  seed: number;
  agents: Agent[];
  port?: number;
  deadlineMs?: number;
  minTurnMs?: number;
  maxTurns?: number;
  hub?: ActPromptHub;
  bus?: MessageBus;
  steering?: SteeringStore;
  autorun?: boolean;
}): Promise<ServerHandle> {
  const runner = new GameRunner({
    seed: opts.seed,
    agents: opts.agents,
    maxTurns: opts.maxTurns,
    deadlineMs: opts.deadlineMs,
    minTurnMs: opts.minTurnMs,
    bus: opts.bus,
  });
  const http = createServer(createApp(runner, opts.hub, opts.steering));
  const ws = attachWebsockets(http, runner, opts.hub, opts.bus);
  await new Promise<void>((r) => http.listen(opts.port ?? 0, r));
  const port = (http.address() as { port: number }).port;
  if (opts.autorun !== false) void runner.run();
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    runner,
    close: async () => {
      ws.close();
      await new Promise<void>((res) => http.close(() => res()));
    },
  };
}
