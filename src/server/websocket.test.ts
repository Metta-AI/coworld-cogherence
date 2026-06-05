import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { attachWebsockets } from "./websocket";
import { GameRunner } from "./game-runner";
import { greedyAgent } from "../agents/stub";
import { ActPromptHub } from "./act-prompt-hub";

async function connect(path: string) {
  const runner = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 100 });
  const http = createServer();
  const wss = attachWebsockets(http, runner);
  await new Promise<void>((r) => http.listen(0, r));
  const port = (http.address() as { port: number }).port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  const first = await new Promise<{ type: string; snapshot?: { tiles: unknown[]; cogs: { id: string; treasury: unknown }[] } }>(
    (res) => ws.on("message", (d) => res(JSON.parse(d.toString()))),
  );
  const cleanup = () => {
    ws.close();
    wss.close();
    http.close();
  };
  return { first, cleanup };
}

describe("websocket", () => {
  it("sends a head snapshot on /global/ws connect", async () => {
    const { first, cleanup } = await connect("/global/ws");
    expect(first.type).toBe("snapshot");
    expect(first.snapshot!.tiles).toHaveLength(127);
    cleanup();
  });
  it("redacts per-cog snapshots on /cog/:id/ws", async () => {
    const { first, cleanup } = await connect("/cog/cog0/ws");
    const other = first.snapshot!.cogs.find((c) => c.id === "cog1")!;
    expect(other.treasury).toEqual({ C: 0, O: 0, Ge: 0, S: 0 });
    cleanup();
  });

  it("broadcasts actPrompt frames from the hub to the global client", async () => {
    const runner = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 100 });
    const hub = new ActPromptHub();
    const http = createServer();
    const wss = attachWebsockets(http, runner, hub);
    await new Promise<void>((r) => http.listen(0, r));
    const port = (http.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/global/ws`);
    await new Promise<void>((res) => ws.on("open", () => res()));
    const got = new Promise<{ type: string; content?: string }>((res) =>
      ws.on("message", (d) => {
        const m = JSON.parse(d.toString());
        if (m.type === "actPrompt") res(m);
      }),
    );
    hub.record({ cogId: "cog0", turn: 1, phase: "commit", content: "saw X -> bid 2" });
    expect((await got).content).toContain("bid 2");
    ws.close();
    wss.close();
    http.close();
  });

  it("backfills recent events on connect", async () => {
    const runner = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 2, deadlineMs: 50 });
    await runner.run(); // populates recentEvents
    const http = createServer();
    const wss = attachWebsockets(http, runner);
    await new Promise<void>((r) => http.listen(0, r));
    const port = (http.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/global/ws`);
    const frames: { type: string }[] = [];
    await new Promise<void>((res) => {
      ws.on("message", (d) => {
        frames.push(JSON.parse(d.toString()));
        if (frames.some((f) => f.type === "event")) res();
      });
      setTimeout(res, 800);
    });
    expect(frames.some((f) => f.type === "event")).toBe(true);
    ws.close();
    wss.close();
    http.close();
  });
});
