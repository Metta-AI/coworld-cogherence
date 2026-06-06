import { describe, it, expect, afterAll } from "vitest";
import { createApp } from "./http";
import { GameRunner } from "./game-runner";
import { greedyAgent } from "../agents/stub";
import { ActPromptHub } from "./act-prompt-hub";
import { SteeringStore } from "./steering-store";

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
  it("GET /cog/:id/act-prompts -> the cog's recorded entries", async () => {
    const hub = new ActPromptHub();
    hub.record({ cogId: "cog0", turn: 1, phase: "commit", content: "hello" });
    const srv = createApp(runner, hub).listen(0);
    const p = (srv.address() as { port: number }).port;
    const j = await (await fetch(`http://127.0.0.1:${p}/cog/cog0/act-prompts`)).json();
    srv.close();
    expect(j).toHaveLength(1);
    expect(j[0].content).toBe("hello");
  });

  it("GET/POST /cog/:id/steering -> reads and edits operator steering", async () => {
    const steering = new SteeringStore();
    const srv = createApp(runner, undefined, steering).listen(0);
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    // defaults
    expect(await (await fetch(`${url}/cog/cog0/steering`)).json()).toEqual({ persona: "", paused: false });
    // edit
    const posted = await (
      await fetch(`${url}/cog/cog0/steering`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona: "betray everyone", paused: true }),
      })
    ).json();
    srv.close();
    expect(posted).toEqual({ persona: "betray everyone", paused: true });
    expect(steering.get("cog0")).toEqual({ persona: "betray everyone", paused: true });
  });

  it("POST /cog/:id/steering -> 400 on an invalid patch", async () => {
    const steering = new SteeringStore();
    const srv = createApp(runner, undefined, steering).listen(0);
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    const r = await fetch(`${url}/cog/cog0/steering`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paused: "yes please" }), // wrong type
    });
    srv.close();
    expect(r.status).toBe(400);
  });
});
