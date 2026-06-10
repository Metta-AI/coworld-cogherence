import { describe, it, expect, afterAll } from "vitest";
import { createApp } from "./http";
import { GameRunner } from "./game-runner";
import { greedyAgent } from "../agents/stub";
import { ActPromptHub } from "./act-prompt-hub";
import { SteeringStore } from "./steering-store";
import { ReplayRecorder } from "./replay-recorder";

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
  it("POST /cogs/add seats a new cog; a full board is a 409", async () => {
    const r2 = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 100 });
    const srv = createApp(r2).listen(0);
    const p = (srv.address() as { port: number }).port;
    const j = await (await fetch(`http://127.0.0.1:${p}/cogs/add`, { method: "POST" })).json();
    expect(j).toEqual({ ok: true, id: "cog2" });
    const snap = await (await fetch(`http://127.0.0.1:${p}/global.json`)).json();
    expect(snap.cogs).toHaveLength(3);
    for (let i = 0; i < 3; i++) await fetch(`http://127.0.0.1:${p}/cogs/add`, { method: "POST" }); // fill all 6 seats
    const full = await fetch(`http://127.0.0.1:${p}/cogs/add`, { method: "POST" });
    expect(full.status).toBe(409);
    expect((await full.json()).error).toMatch(/at most 6/);
    srv.close();
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
    expect(await (await fetch(`${url}/cog/cog0/steering`)).json()).toEqual({ persona: "", paused: false, pending: [], standingBid: 0 });
    // edit — including a queued operator order
    const posted = await (
      await fetch(`${url}/cog/cog0/steering`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona: "betray everyone", paused: true, pending: [{ type: "align", tile: "0,0", force: 3 }] }),
      })
    ).json();
    // malformed pending orders bounce at the boundary
    const bad = await fetch(`${url}/cog/cog0/steering`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pending: [{ type: "align", tile: "0,0", force: 0 }] }),
    });
    srv.close();
    expect(posted).toEqual({ persona: "betray everyone", paused: true, pending: [{ type: "align", tile: "0,0", force: 3 }], standingBid: 0 });
    expect(steering.get("cog0").pending).toEqual([{ type: "align", tile: "0,0", force: 3 }]);
    expect(bad.status).toBe(400);
  });

  it("GET /replay.json -> the live server's own recorded game", async () => {
    const r2 = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 2, deadlineMs: 20 });
    const recorder = new ReplayRecorder(r2, { seed: 7, agents: ["greedy", "greedy"], turns: 2 });
    await r2.run();
    const srv = createApp(r2, undefined, undefined, recorder).listen(0);
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    const doc = await (await fetch(`${url}/replay.json`)).json();
    srv.close();
    expect(doc.meta.agents).toEqual(["greedy", "greedy"]);
    expect(doc.frames.filter((f: { type: string }) => f.type === "snapshot").length).toBeGreaterThanOrEqual(3);
  });

  it("defaultLive redirects a bare route to ?live (and not when ?live is already present)", async () => {
    const srv = createApp(runner, undefined, undefined, undefined, { defaultLive: true }).listen(0);
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    const bare = await fetch(`${url}/`, { redirect: "manual" });
    const already = await fetch(`${url}/?live`, { redirect: "manual" });
    srv.close();
    expect(bare.status).toBe(302);
    expect(bare.headers.get("location")).toBe("/?live");
    expect(already.status).not.toBe(302); // already live -> serve the app, don't loop
  });

  it("does not redirect when defaultLive is off (replay-mode default)", async () => {
    const srv = createApp(runner).listen(0);
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    const bare = await fetch(`${url}/`, { redirect: "manual" });
    srv.close();
    expect(bare.status).not.toBe(302);
  });

  it("POST /reset -> ok, restarting the runner from turn 1", async () => {
    const r2 = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 1, deadlineMs: 20 });
    await r2.run();
    expect(r2.state.turn).toBe(2); // finished a 1-turn game
    const srv = createApp(r2).listen(0);
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    const res = await fetch(`${url}/reset`, { method: "POST" });
    const body = await res.json();
    srv.close();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("POST /pause and /resume toggle the runner's paused state", async () => {
    const r2 = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 1, deadlineMs: 20 });
    const srv = createApp(r2).listen(0);
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    const pause = await fetch(`${url}/pause`, { method: "POST" });
    expect(pause.status).toBe(200);
    expect(r2.currentStatus().paused).toBe(true);
    await fetch(`${url}/resume`, { method: "POST" });
    expect(r2.currentStatus().paused).toBe(false);
    srv.close();
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
