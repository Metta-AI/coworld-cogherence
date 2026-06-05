# Cogherence Live Server Core (Phase A) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up a live HTTP + websocket server that drives a game turn-by-turn with a per-cog deadline-bounded Commit phase, broadcasts the existing `ServerMessage` frames, and a live React client that renders it — so a scripted game is watchable live in the browser (no LLM, no chat yet).

**Architecture:** A pure async `game-runner` owns `GameState` + per-cog `CogStateStore`s and a `PhaseCoordinator` (collect submissions or default on deadline). `http.ts` serves the built client + a small operator API; `websocket.ts` fans out `/global/ws` (full) and `/cog/:id/ws` (redacted) and does head-first backfill. The client gets a `WorldSocket` + `connectLiveFeed` behind the SAME snapshot list the replay viewer already uses. Server runs via `tsx` (no tsc emit yet).

**Tech Stack:** TypeScript (ESM, strict), `express`, `ws`, vitest (incl. real in-process ws round-trips), zod (frames), tsx (run). Mirrors `cogame-polis` server conventions. Design: [2026-06-05-cogherence-live-dashboard-design.md](2026-06-05-cogherence-live-dashboard-design.md).

---

## Conventions

kebab-case files; zod validate inbound (drop) / throw on bad outbound; **fail loud** (no error-swallowing); deterministic engine; module header comment per file; commit after each green step. Server code lives in `src/server/`; it imports only `src/shared` (never `src/client`).

---

## Task A1: Server deps + scripts

**Files:** Modify `package.json`

**Step 1:** Add deps `"express": "^4.19"`, `"ws": "^8.18"`; devDeps `"@types/express": "^4.17"`, `"@types/ws": "^8.5"`.
**Step 2:** Add scripts: `"serve": "tsx src/cli-serve.ts"`, `"serve:llm": "AWS_REGION=${AWS_REGION:-us-west-2} tsx src/cli-serve.ts"`.
**Step 3:** Run `npm install`; `npm run typecheck` (still clean); `npm test` (still green).
**Step 4:** Commit `"chore: add express + ws server deps"`.

---

## Task A2: Extend `ServerStatus` in the protocol

**Files:** Modify `src/shared/protocol.ts`, `src/shared/protocol.test.ts`

**Step 1: Failing test** — the richer status validates.
```ts
it("serverStatus carries phase/pending/done/deadline", () => {
  expect(() =>
    serverStatusSchema.parse({
      turn: 3, phase: "commit", finished: false, cogCount: 4, clientCount: 1,
      pending: ["cog0"], done: ["cog1", "cog2", "cog3"], phaseDeadlineAt: 1000,
    }),
  ).not.toThrow();
});
```
**Step 2:** Run → FAIL (extra keys rejected by `.strict()`).
**Step 3:** Implement — extend `serverStatusSchema`:
```ts
export const serverStatusSchema = z
  .object({
    turn: z.number().int(),
    phase: phaseSchema,
    finished: z.boolean(),
    cogCount: z.number().int(),
    clientCount: z.number().int().default(0),
    pending: z.array(z.string()).default([]),
    done: z.array(z.string()).default([]),
    phaseDeadlineAt: z.number().optional(),
  })
  .strict();
```
Update `recordGame` in `src/shared/replay.ts` to include `clientCount: 0, pending: [], done: []` (or rely on defaults — confirm `serverMessageSchema.parse` still passes existing replay frames).
**Step 4:** Run → PASS; full `npm test` green.
**Step 5:** Commit `"feat: richer ServerStatus (phase/pending/done/deadline)"`.

---

## Task A3: `CogStateStore` — per-cog arm with deadline

A per-cog mailbox: the runner "opens" a phase (arms it with a deadline); the cog (or its agent) submits; the runner awaits the arm, which resolves with the submission or `null` on timeout.

**Files:** Create `src/server/cog-state-store.ts`, `src/server/cog-state-store.test.ts`

**Step 1: Failing test** (use a fake clock via `vi.useFakeTimers()`).
```ts
import { describe, it, expect, vi } from "vitest";
import { CogStateStore } from "./cog-state-store";

describe("CogStateStore", () => {
  it("resolves with the submitted payload", async () => {
    const s = new CogStateStore("cog0");
    const armed = s.arm(1000);
    s.submit(["x"]);
    expect(await armed).toEqual(["x"]);
  });
  it("resolves null when the deadline passes with no submit", async () => {
    vi.useFakeTimers();
    const s = new CogStateStore("cog0");
    const armed = s.arm(1000);
    vi.advanceTimersByTime(1000);
    expect(await armed).toBeNull();
    vi.useRealTimers();
  });
  it("ignores a late submit after timeout", async () => {
    vi.useFakeTimers();
    const s = new CogStateStore("cog0");
    const armed = s.arm(1000);
    vi.advanceTimersByTime(1000);
    await armed;
    expect(() => s.submit(["late"])).not.toThrow(); // no-op, no throw
    vi.useRealTimers();
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement** (generic over the submitted type).
```ts
// src/server/cog-state-store.ts
// A per-cog "arm + submit" mailbox. The runner arms a phase with a deadline; the
// cog submits before it, else the arm resolves null (-> caller applies a default).
import type { CogId } from "../shared/engine/types";

export class CogStateStore<T = unknown> {
  constructor(readonly cogId: CogId) {}
  private resolve: ((v: T | null) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Open the phase; resolves with the submission or null at the deadline. */
  arm(deadlineMs: number): Promise<T | null> {
    return new Promise<T | null>((res) => {
      this.resolve = res;
      this.timer = setTimeout(() => this.finish(null), deadlineMs);
    });
  }
  /** The cog's submission for the open phase (no-op if none is armed). */
  submit(value: T): void {
    this.finish(value);
  }
  private finish(value: T | null): void {
    if (this.timer) clearTimeout(this.timer);
    const r = this.resolve;
    this.resolve = null;
    this.timer = null;
    if (r) r(value);
  }
}
```
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: CogStateStore (arm + submit + deadline)"`.

---

## Task A4: `PhaseCoordinator` — collect across cogs

**Files:** Create `src/server/phase-coordinator.ts`, `src/server/phase-coordinator.test.ts`

**Step 1: Failing test**
```ts
import { describe, it, expect, vi } from "vitest";
import { PhaseCoordinator } from "./phase-coordinator";

describe("PhaseCoordinator.collect", () => {
  it("returns each cog's submission keyed by id", async () => {
    const pc = new PhaseCoordinator(["cog0", "cog1"]);
    const p = pc.collect(1000, () => []);
    pc.submit("cog0", ["a"]);
    pc.submit("cog1", ["b"]);
    expect(await p).toEqual({ cog0: ["a"], cog1: ["b"] });
  });
  it("defaults a cog that misses the deadline", async () => {
    vi.useFakeTimers();
    const pc = new PhaseCoordinator(["cog0", "cog1"]);
    const p = pc.collect(1000, (id) => [`default-${id}`]);
    pc.submit("cog0", ["a"]);
    vi.advanceTimersByTime(1000);
    expect(await p).toEqual({ cog0: ["a"], cog1: ["default-cog1"] });
    vi.useRealTimers();
  });
  it("exposes pending/done as cogs submit", async () => {
    const pc = new PhaseCoordinator(["cog0", "cog1"]);
    const p = pc.collect(1000, () => []);
    expect(pc.pending()).toEqual(["cog0", "cog1"]);
    pc.submit("cog0", ["a"]);
    expect(pc.done()).toEqual(["cog0"]);
    pc.submit("cog1", ["b"]);
    await p;
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement** — one `CogStateStore` per cog; `collect` arms all and `Promise.all`s.
```ts
// src/server/phase-coordinator.ts
// Collect one submission per cog for a phase: resolve when all submit OR the
// deadline hits (missing cogs get a default). Tracks pending/done for status.
import type { CogId } from "../shared/engine/types";
import { CogStateStore } from "./cog-state-store";

export class PhaseCoordinator<T = unknown> {
  private stores = new Map<CogId, CogStateStore<T>>();
  private answered = new Set<CogId>();
  constructor(private readonly cogIds: CogId[]) {
    for (const id of cogIds) this.stores.set(id, new CogStateStore<T>(id));
  }
  async collect(deadlineMs: number, makeDefault: (id: CogId) => T): Promise<Record<CogId, T>> {
    this.answered.clear();
    const entries = this.cogIds.map(async (id) => {
      const v = await this.stores.get(id)!.arm(deadlineMs);
      return [id, v ?? makeDefault(id)] as const;
    });
    return Object.fromEntries(await Promise.all(entries)) as Record<CogId, T>;
  }
  submit(id: CogId, value: T): void {
    if (!this.stores.has(id)) return;
    this.answered.add(id);
    this.stores.get(id)!.submit(value);
  }
  pending(): CogId[] {
    return this.cogIds.filter((id) => !this.answered.has(id));
  }
  done(): CogId[] {
    return this.cogIds.filter((id) => this.answered.has(id));
  }
}
```
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: PhaseCoordinator (collect submissions or default on deadline)"`.

---

## Task A5: Per-cog redaction (`buildCogSnapshot`)

For Phase A: others' treasuries are hidden (zeroed) — hearts/energy stay public. (Message redaction arrives in Phase C.)

**Files:** Create `src/server/redact.ts`, `src/server/redact.test.ts`

**Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { newGame } from "../shared/engine/game";
import { toSnapshot } from "../shared/snapshot";
import { buildCogSnapshot } from "./redact";

describe("buildCogSnapshot", () => {
  it("keeps the viewer's own treasury but hides others'", () => {
    const snap = toSnapshot(newGame(7, 4));
    const view = buildCogSnapshot(snap, "cog0");
    const me = view.cogs.find((c) => c.id === "cog0")!;
    const other = view.cogs.find((c) => c.id === "cog1")!;
    expect(me.treasury).toEqual(snap.cogs.find((c) => c.id === "cog0")!.treasury);
    expect(other.treasury).toEqual({ C: 0, O: 0, Ge: 0, S: 0 });
    expect(other.hearts).toBe(snap.cogs.find((c) => c.id === "cog1")!.hearts); // hearts public
  });
  it("leaves tiles untouched (board is public)", () => {
    const snap = toSnapshot(newGame(7, 4));
    expect(buildCogSnapshot(snap, "cog0").tiles).toEqual(snap.tiles);
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement**
```ts
// src/server/redact.ts
// Per-observer projection of a snapshot: the board + everyone's hearts are public,
// but only the viewer sees its own treasury/energy. One redaction path for live +
// replay + fog of war.
import type { CogId } from "../shared/engine/types";
import type { GameSnapshot } from "../shared/snapshot";

export function buildCogSnapshot(snap: GameSnapshot, viewer: CogId): GameSnapshot {
  return {
    ...snap,
    cogs: snap.cogs.map((c) =>
      c.id === viewer ? c : { ...c, treasury: { C: 0, O: 0, Ge: 0, S: 0 }, energy: 0 },
    ),
  };
}
```
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: buildCogSnapshot per-cog redaction"`.

---

## Task A6: `GameRunner` — live async turn loop

Drives turns: arm a Commit phase (deadline) → collect orders (default `[]`) → `resolve` → `upkeep` → bump turn → emit frames via `onUpdate`. Submissions come from `coordinator.submit(cogId, orders)` (an agent/socket/test calls it). The runner is engine-pure underneath; only timing/IO differs from `runGame`.

**Files:** Create `src/server/game-runner.ts`, `src/server/game-runner.test.ts`

**Step 1: Failing test** — a runner with auto-submitting scripted agents produces a frame stream and finishes.
```ts
import { describe, it, expect } from "vitest";
import { GameRunner } from "./game-runner";
import { greedyAgent, peacefulAgent } from "../agents/stub";
import type { ServerMessage } from "../shared/protocol";

describe("GameRunner", () => {
  it("runs a scripted game to completion and emits frames", async () => {
    const runner = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), peacefulAgent("cog1")], maxTurns: 3, deadlineMs: 50 });
    const frames: ServerMessage[] = [];
    runner.onUpdate((m) => frames.push(m));
    await runner.run();
    expect(frames.some((f) => f.type === "snapshot")).toBe(true);
    expect(frames.filter((f) => f.type === "serverStatus").at(-1)!.type).toBe("serverStatus");
    expect(runner.state.turn).toBe(4); // 3 turns played
  });
  it("auto-drives in-process agents via submit()", async () => {
    const runner = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 2, deadlineMs: 50 });
    const winner = await runner.run();
    expect(["cog0", "cog1", null]).toContain(winner.winner);
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement** — agents are invoked to produce submissions; the coordinator collects with a deadline (so a missing submit defaults to `[]`). For Phase A, the runner calls each agent's `commit` and `submit`s the result; the deadline guards a hung agent.
```ts
// src/server/game-runner.ts
// The live turn loop: per turn, open a Commit phase (deadline-bounded), collect
// each cog's orders (default [] on timeout), resolve + upkeep, emit frames.
// Engine-pure underneath; this layer only adds timing, the coordinator, and IO.
import type { GameState, CogId } from "../shared/engine/types";
import type { Order } from "../shared/engine/orders";
import type { Agent } from "../agents/types";
import type { ServerMessage, ServerStatus } from "../shared/protocol";
import { newGame, stepTurn, scoreGame } from "../shared/engine/game";
import { toSnapshot } from "../shared/snapshot";
import { PhaseCoordinator } from "./phase-coordinator";

type Listener = (m: ServerMessage) => void;

export class GameRunner {
  state: GameState;
  private agents: Agent[];
  private maxTurns: number;
  private deadlineMs: number;
  private listeners: Listener[] = [];
  private clientCount = 0;

  constructor(opts: { seed: number; agents: Agent[]; maxTurns?: number; deadlineMs?: number }) {
    this.agents = opts.agents;
    this.maxTurns = opts.maxTurns ?? 100;
    this.deadlineMs = opts.deadlineMs ?? 20_000;
    this.state = newGame(opts.seed, opts.agents.length);
  }

  onUpdate(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }
  setClientCount(n: number): void {
    this.clientCount = n;
  }
  private emit(m: ServerMessage): void {
    for (const l of this.listeners) l(m);
  }
  private status(extra: Partial<ServerStatus> = {}): ServerStatus {
    return {
      turn: this.state.turn,
      phase: this.state.phase,
      finished: this.state.turn > this.maxTurns,
      cogCount: this.agents.length,
      clientCount: this.clientCount,
      pending: [],
      done: [],
      ...extra,
    };
  }

  async run(): Promise<{ winner: CogId | null; standings: Array<{ cog: CogId; hearts: number }> }> {
    this.emit({ type: "snapshot", snapshot: toSnapshot(this.state) });
    this.emit({ type: "serverStatus", status: this.status() });

    while (this.state.turn <= this.maxTurns) {
      const ids = this.agents.map((a) => a.id);
      const coord = new PhaseCoordinator<Order[]>(ids);
      const collected = coord.collect(this.deadlineMs, () => []);
      // drive in-process agents (Phase B replaces this with the CogAgent loop)
      const snapshot = this.state;
      await Promise.all(
        this.agents.map(async (a) => coord.submit(a.id, await a.commit({ state: snapshot, me: a.id }))),
      );
      const ordersByCog = await collected;

      const r = stepTurn(this.state, ordersByCog);
      this.state = r;
      const rec = this.state.log[this.state.log.length - 1]!;
      for (const ev of rec.events) this.emit({ type: "event", event: ev });
      this.emit({ type: "snapshot", snapshot: toSnapshot(this.state) });
      this.emit({ type: "serverStatus", status: this.status() });
    }
    return scoreGame(this.state);
  }
}
```
> Note: `stepTurn` is sync and pure; the runner stays the single place that knows about timing. The deadline guards a hung agent (its `submit` never fires → coordinator defaults `[]`).
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: GameRunner live turn loop (commit barrier + deadline)"`.

---

## Task A7: `http.ts` — express app (static + operator API)

**Files:** Create `src/server/http.ts`, `src/server/http.test.ts`

**Step 1: Failing test** (use `supertest`-free: call the returned express app via `http` + a real listen on port 0, or test the route handlers). Simplest: build the app, `app.listen(0)`, fetch `/health` and `/global.json`.
```ts
import { describe, it, expect, afterAll } from "vitest";
import { createApp } from "./http";
import { GameRunner } from "./game-runner";
import { greedyAgent } from "../agents/stub";

const runner = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 100 });
const server = createApp(runner).listen(0);
const base = () => `http://127.0.0.1:${(server.address() as { port: number }).port}`;
afterAll(() => server.close());

describe("http", () => {
  it("GET /health -> ok", async () => {
    expect((await fetch(`${base()}/health`)).status).toBe(200);
  });
  it("GET /global.json -> current snapshot", async () => {
    const j = await (await fetch(`${base()}/global.json`)).json();
    expect(j.tiles).toHaveLength(127);
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement** `createApp(runner): express.Express` — `GET /health` → `"ok"`; `GET /global.json` → `toSnapshot(runner.state)`; `GET /cog/:id/state.json` → `buildCogSnapshot(...)`; static-serve `dist/` (built client) with index fallbacks for `/`, `/cog/:id`, `/feed`. (Static serving only matters in production; tests hit the JSON routes.)
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: express app (health + state json + static client)"`.

---

## Task A8: `websocket.ts` — `/global/ws` + `/cog/:id/ws`

**Files:** Create `src/server/websocket.ts`, `src/server/websocket.test.ts`

**Step 1: Failing test** — attach to a real http server, connect a `ws` client to `/global/ws`, assert it receives a snapshot on connect and on runner update.
```ts
import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { attachWebsockets } from "./websocket";
import { GameRunner } from "./game-runner";
import { greedyAgent } from "../agents/stub";

describe("websocket", () => {
  it("sends a head snapshot on connect", async () => {
    const runner = new GameRunner({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], maxTurns: 100 });
    const http = createServer();
    attachWebsockets(http, runner);
    await new Promise<void>((r) => http.listen(0, r));
    const port = (http.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/global/ws`);
    const first = await new Promise<any>((res) => ws.on("message", (d) => res(JSON.parse(d.toString()))));
    expect(first.type).toBe("snapshot");
    ws.close();
    http.close();
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement** `attachWebsockets(httpServer, runner)`:
- A `noServer` `WebSocketServer`; on `upgrade`, route by `url.pathname` (`/global/ws` vs `/cog/:id/ws`).
- On connect: send head `snapshot` (redacted for cog sockets) + `serverStatus` + recent events; track `clientCount` → `runner.setClientCount`.
- `runner.onUpdate(m => ...)`: broadcast to `/global` clients verbatim; for each `/cog/:id` client, redact snapshots via `buildCogSnapshot` and forward events/status.
- Validate nothing inbound for now (read-only) beyond a `hello`.
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: websocket fan-out (/global/ws + /cog/:id/ws)"`.

---

## Task A9: `runtime.ts` + `cli-serve.ts`

**Files:** Create `src/server/runtime.ts`, `src/cli-serve.ts`; test `src/server/runtime.test.ts`

**Step 1: Failing test** — `startServer` returns a handle; `/health` responds; closing works.
```ts
import { describe, it, expect } from "vitest";
import { startServer } from "./runtime";
import { greedyAgent } from "../agents/stub";

describe("startServer", () => {
  it("listens and serves, then closes", async () => {
    const h = await startServer({ seed: 7, agents: [greedyAgent("cog0"), greedyAgent("cog1")], port: 0, autorun: false });
    expect((await fetch(`${h.url}/health`)).status).toBe(200);
    await h.close();
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement**
- `runtime.ts`: `startServer({seed, agents, port, autorun, deadlineMs}) → { url, port, runner, close() }` — build `GameRunner`, `createApp`, `attachWebsockets`, `listen(port)`; if `autorun !== false`, kick `runner.run()` (don't await). `close()` stops ws + http.
- `cli-serve.ts`: parse `--seed --cogs --port --agents --deadline`, build agents via the existing `buildAgents` (reuse from cli.ts — export it or move to a shared helper), `startServer({autorun:true})`, print the URLs (operator console, ws).
**Step 4:** Run → PASS; manual: `npm run serve -- --seed 7 --cogs 4` prints URLs and a scripted game advances.
**Step 5:** Commit `"feat: startServer runtime + serve CLI"`.

---

## Task A10: Client live feed (`world-socket.ts` + `feed.ts`) + live App

**Files:** Create `src/client/net/world-socket.ts`, `src/client/net/feed.ts`, tests; modify `src/client/App.tsx`

**Step 1: Failing test** — `connectLiveFeed` wires snapshot/event/status frames into a store and calls `onChange`.
```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { connectLiveFeed, type FeedStore } from "./feed";

class FakeSocket {
  handlers: Record<string, ((d: any) => void)[]> = {};
  on(ev: string, fn: (d: any) => void) { (this.handlers[ev] ??= []).push(fn); }
  emit(ev: string, d: any) { (this.handlers[ev] ?? []).forEach((h) => h(d)); }
  close() {}
}

describe("connectLiveFeed", () => {
  it("applies snapshot frames to the store and notifies", () => {
    const store: FeedStore = { snapshots: [], events: [], status: null };
    const sock = new FakeSocket();
    const onChange = vi.fn();
    connectLiveFeed(store, () => sock as any, onChange);
    sock.emit("message", JSON.stringify({ type: "snapshot", snapshot: { turn: 1, tiles: [], cogs: [], commons: 0, version: "0", seed: 7, phase: "negotiate", radius: 6, coherenceMax: 6 } }));
    expect(store.snapshots).toHaveLength(1);
    expect(onChange).toHaveBeenCalled();
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement**
- `world-socket.ts`: a thin wrapper over the browser `WebSocket` with reconnect/backoff and an `on("message")` that hands parsed `ServerMessage`s up. A `makeSocket(url)` factory injected for tests.
- `feed.ts`: `FeedStore { snapshots: GameSnapshot[]; events: TurnEvent[]; status: ServerStatus | null }` and `connectLiveFeed(store, makeSocket, onChange)` validating each frame via `serverMessageSchema`, applying it, then `onChange()`.
- `App.tsx`: when a `?live` query param (or a `live` prop) is set, use `connectLiveFeed` to populate snapshots (auto-follow head) instead of `fetch("./replay.json")`. The HexBoard/Scrubber/Hud already render a `GameSnapshot[]`, so no render changes.
**Step 4:** Run → PASS; full `npm test` + `npm run typecheck` green.
**Step 5:** Commit `"feat: live WorldSocket + connectLiveFeed; App live mode"`.

---

## Task A11: Playwright smoke — live game in the browser

**Files:** Modify `playwright.config.ts` (or add a spec); create `tests/smoke/live.spec.ts`

**Step 1:** A spec that boots `startServer({autorun:true})` in the Playwright `webServer` (or a global-setup), serves the built client, opens `/?live`, and asserts 127 polygons render and the turn label advances within a few seconds.
**Step 2:** Run → FAIL.
**Step 3:** Wire the live server into the smoke harness (serve dist + the ws server on one port).
**Step 4:** `npm run smoke` → PASS.
**Step 5:** Commit `"test: playwright smoke for live scripted game"`.

---

## Milestones

- **M1 (A1–A6):** Protocol + the deterministic server core (store, coordinator, redaction) — all unit-testable, no IO.
- **M2 (A7–A9):** The live server (express + ws + runtime + CLI) — a scripted game runs live, frames over ws.
- **M3 (A10–A11):** The client goes live; a browser smoke proves it.

## Notes for the executor

- `buildAgents` currently lives in `src/cli.ts`; export it (or lift to `src/server/agents.ts`) so `cli-serve.ts` reuses it.
- Keep `src/server/` importing only `src/shared` + `src/agents` — never `src/client`.
- Deadlines use real timers in production; tests use `vi.useFakeTimers()` or tiny `deadlineMs`.
- Phase B swaps the runner's inline `agent.commit` drive for the `CogAgent` loop; Phase C adds the negotiate window before the commit barrier. Don't build those here.
