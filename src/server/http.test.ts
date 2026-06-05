import { describe, it, expect, afterAll } from "vitest";
import { createApp } from "./http";
import { GameRunner } from "./game-runner";
import { greedyAgent } from "../agents/stub";

const runner = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 100 });
const server = createApp(runner).listen(0);
const base = () => `http://127.0.0.1:${(server.address() as { port: number }).port}`;
afterAll(() => {
  server.close();
});

describe("http", () => {
  it("GET /health -> ok", async () => {
    const r = await fetch(`${base()}/health`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
  });
  it("GET /global.json -> current full snapshot", async () => {
    const j = await (await fetch(`${base()}/global.json`)).json();
    expect(j.tiles).toHaveLength(127);
    expect(j.cogs.find((c: { id: string }) => c.id === "cog1").treasury).toBeDefined();
  });
  it("GET /cog/:id/state.json -> redacted snapshot (others' treasury hidden)", async () => {
    const j = await (await fetch(`${base()}/cog/cog0/state.json`)).json();
    expect(j.cogs.find((c: { id: string }) => c.id === "cog1").treasury).toEqual({ C: 0, O: 0, Ge: 0, S: 0 });
  });
});
