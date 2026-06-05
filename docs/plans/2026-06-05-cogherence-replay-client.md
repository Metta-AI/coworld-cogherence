# Cogherence Replay Client (Phase 1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the engine under `src/shared/`, add a recorded `ServerMessage[]` replay format, and build a vite + React client that renders a recorded Cogherence game as an SVG hex lattice you can scrub turn-by-turn.

**Architecture:** Pure core stays deterministic under `src/shared/` (mirrors `cogame-polis`). A replay is a `ServerMessage[]` stream — the *same* shape the phase-3 live server will broadcast — so the client's frame consumer never changes when we go live. Full-state snapshots (not deltas) mean phase-2 LLM games (not reproducible in-browser) are recordable. The client renders any `GameSnapshot` to SVG; a `ReplaySource` (phase 1) and a `WorldSocket` (phase 3) both feed it.

**Tech Stack:** TypeScript (ESM, strict), vitest (TDD; `jsdom` for client), zod (the wire contract), React 18 + vite, `@testing-library/react`, Playwright (smoke). Mirrors the polis toolchain.

**Design reference:** [docs/plans/2026-06-05-cogherence-followons-design.md](2026-06-05-cogherence-followons-design.md). Engine semantics: [docs/plans/2026-06-04-cogherence-engine.md](2026-06-04-cogherence-engine.md).

---

## Conventions (from polis — apply throughout)

- **kebab-case** files; **PascalCase** types/components; **camelCase** functions; zod schemas `camelCaseSchema`.
- **zod at boundaries:** validate on load/over-the-wire; **drop** invalid inbound, **throw** on invalid outbound.
- **Fail loud:** no error-swallowing `try/catch` (only `try/finally` for cleanup).
- **Determinism:** nothing in `src/shared/` calls `Date.now()` / `Math.random()` / I/O.
- **1–2 line module header comment** on every new file.
- Commit after every green step.

---

## Task 1: Restructure `src/engine` → `src/shared/engine` (keep 109 tests green)

Path-only refactor. Intra-engine imports are relative (`./types`, `./hex`), so moving the whole directory preserves them; only external importers (`src/agents/*`, `src/cli.ts`, `src/index.ts`) change.

**Files:**
- Move: `src/engine/` → `src/shared/engine/` (all `.ts` + `.test.ts`)
- Modify external imports in: `src/agents/types.ts`, `src/agents/stub.ts`, `src/agents/stub.test.ts`, `src/cli.ts`, `src/cli.test.ts`, `src/index.ts`

**Step 1: Move the directory with git**
```bash
git mv src/engine src/shared/engine
```

**Step 2: Verify the break**

Run: `npm run typecheck`
Expected: FAIL — external importers reference the old `./engine/...` / `../engine/...` paths.

**Step 3: Find every stale import**
```bash
grep -rn "engine/" src --include=*.ts | grep -v "src/shared/engine/"
```
This lists exactly the import sites to fix (in `src/agents/*`, `src/cli*.ts`, `src/index.ts`).

**Step 4: Rewrite the import paths**

In `src/agents/types.ts` and `src/agents/stub.ts` (and `stub.test.ts`): `../engine/` → `../shared/engine/`.
In `src/cli.ts` and `src/cli.test.ts`: `./engine/` → `./shared/engine/`.
In `src/index.ts`: any `./engine/` → `./shared/engine/`.

**Step 5: Verify green**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; **109 tests pass** (same count as before — no behavior changed).

**Step 6: Commit**
```bash
git add -A
git commit -m "refactor: move engine under src/shared/ (polis layout)"
```

---

## Task 2: `GameSnapshot` + `toSnapshot`

A full, serializable per-turn view — everything the spectator/client needs to render one turn.

**Files:**
- Create: `src/shared/version.ts`, `src/shared/snapshot.ts`
- Test: `src/shared/snapshot.test.ts`

**Step 1: Write the version module**
```ts
// src/shared/version.ts
// Single source of truth for the replay/protocol version stamp.
export const COGHERENCE_VERSION = "0.1.0";
```

**Step 2: Write the failing test**
```ts
// src/shared/snapshot.test.ts
import { describe, it, expect } from "vitest";
import { newGame } from "./engine/game";
import { toSnapshot } from "./snapshot";
import { BOARD_RADIUS, COHERENCE_MAX } from "./engine/constants";

describe("toSnapshot", () => {
  it("captures all 127 tiles with axial coords + fields", () => {
    const s = toSnapshot(newGame(7, 4));
    expect(s.tiles).toHaveLength(127);
    const t = s.tiles[0]!;
    expect(t).toHaveProperty("q");
    expect(t).toHaveProperty("r");
    expect(t).toHaveProperty("coherence");
    expect(t).toHaveProperty("mineral");
  });
  it("captures one cog snapshot per cog, with energy derived from treasury", () => {
    const s = toSnapshot(newGame(7, 4));
    expect(s.cogs).toHaveLength(4);
    expect(s.cogs.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    for (const c of s.cogs) expect(c.energy).toBeGreaterThanOrEqual(0);
  });
  it("stamps meta (seed, radius, coherenceMax, commons)", () => {
    const s = toSnapshot(newGame(7, 4));
    expect(s.seed).toBe(7);
    expect(s.radius).toBe(BOARD_RADIUS);
    expect(s.coherenceMax).toBe(COHERENCE_MAX);
    expect(s.commons).toBe(s.tiles.reduce((a, t) => a + t.coherence, 0));
  });
  it("is deterministic for a seed", () =>
    expect(toSnapshot(newGame(7, 4))).toEqual(toSnapshot(newGame(7, 4))));
});
```

**Step 3: Run → FAIL**

Run: `npm test -- snapshot`
Expected: FAIL (no `./snapshot`).

**Step 4: Implement**
```ts
// src/shared/snapshot.ts
// A full, serializable view of one turn: every tile + every cog + the commons.
// The unit the client renders and the live server (phase 3) broadcasts.
import type { GameState, CogId, Mineral, Treasury, Phase } from "./engine/types";
import { maxEnergy } from "./engine/energy";
import { commons } from "./engine/game";
import { COHERENCE_MAX, BOARD_RADIUS } from "./engine/constants";
import { COGHERENCE_VERSION } from "./version";

export interface TileSnapshot {
  q: number; r: number;
  alignment: CogId | null;
  coherence: number;
  mineral: Mineral;
  density: number;
}
export interface CogSnapshot {
  id: CogId; index: number; hearts: number;
  treasury: Treasury; energy: number;
}
export interface GameSnapshot {
  version: string; seed: number; turn: number; phase: Phase;
  radius: number; coherenceMax: number;
  tiles: TileSnapshot[]; cogs: CogSnapshot[]; commons: number;
}

export function toSnapshot(state: GameState): GameSnapshot {
  const tiles: TileSnapshot[] = Object.values(state.tiles).map((t) => ({
    q: t.hex.q, r: t.hex.r,
    alignment: t.alignment, coherence: t.coherence,
    mineral: t.mineral, density: t.density,
  }));
  const cogs: CogSnapshot[] = state.cogOrder.map((id) => {
    const c = state.cogs[id]!;
    return { id: c.id, index: c.index, hearts: c.hearts, treasury: { ...c.treasury }, energy: maxEnergy(c.treasury) };
  });
  return {
    version: COGHERENCE_VERSION, seed: state.seed, turn: state.turn, phase: state.phase,
    radius: BOARD_RADIUS, coherenceMax: COHERENCE_MAX,
    tiles, cogs, commons: commons(state),
  };
}
```

**Step 5: Run → PASS.** `npm test -- snapshot`

**Step 6: Commit**
```bash
git add -A && git commit -m "feat: GameSnapshot + toSnapshot"
```

---

## Task 3: `protocol.ts` — the zod wire/replay contract

The `ServerMessage` discriminated union (mirrors polis `src/shared/protocol.ts`). Its `event` schema mirrors the engine's `ResolveEvent | UpkeepEvent`.

**Files:**
- Create: `src/shared/protocol.ts`
- Test: `src/shared/protocol.test.ts`

**Step 1: Write the failing test** — schemas accept real recorder output and reject junk.
```ts
// src/shared/protocol.test.ts
import { describe, it, expect } from "vitest";
import { newGame } from "./engine/game";
import { toSnapshot } from "./snapshot";
import { gameSnapshotSchema, serverMessageSchema, turnEventSchema } from "./protocol";

describe("protocol", () => {
  it("validates a real snapshot", () =>
    expect(() => gameSnapshotSchema.parse(toSnapshot(newGame(7, 4)))).not.toThrow());
  it("wraps a snapshot in a ServerMessage", () =>
    expect(serverMessageSchema.parse({ type: "snapshot", snapshot: toSnapshot(newGame(7, 4)) }).type).toBe("snapshot"));
  it("validates each engine event variant", () => {
    expect(() => turnEventSchema.parse({ type: "auction", winner: "cog0", price: 3, bids: [["cog0", 4]] })).not.toThrow();
    expect(() => turnEventSchema.parse({ type: "mint", cog: "cog0", gained: { C: 1, O: 0, Ge: 0, S: 2 } })).not.toThrow();
    expect(() => turnEventSchema.parse({ type: "capture", tile: "0,0", from: null, to: "cog1", coherence: 2 })).not.toThrow();
  });
  it("rejects an unknown message type", () =>
    expect(() => serverMessageSchema.parse({ type: "nope" })).toThrow());
});
```

**Step 2: Run → FAIL.** `npm test -- protocol`

**Step 3: Implement**
```ts
// src/shared/protocol.ts
// The single wire/replay contract: a finished game (recorded ServerMessage[])
// and a live game (phase-3 ws broadcast) speak the SAME discriminated union.
// Snapshots are full state; events mirror the engine's ResolveEvent | UpkeepEvent.
import { z } from "zod";

export const mineralSchema = z.enum(["C", "O", "Ge", "S"]);
const phaseSchema = z.enum(["negotiate", "commit", "resolve", "upkeep"]);
const treasurySchema = z
  .object({ C: z.number().int(), O: z.number().int(), Ge: z.number().int(), S: z.number().int() })
  .strict();
const cogIdNullable = z.string().nullable();

const tileSnapshotSchema = z
  .object({
    q: z.number().int(), r: z.number().int(),
    alignment: cogIdNullable, coherence: z.number().int(),
    mineral: mineralSchema, density: z.number(),
  })
  .strict();
const cogSnapshotSchema = z
  .object({
    id: z.string(), index: z.number().int(), hearts: z.number().int(),
    treasury: treasurySchema, energy: z.number().int(),
  })
  .strict();
export const gameSnapshotSchema = z
  .object({
    version: z.string(), seed: z.number(), turn: z.number().int(), phase: phaseSchema,
    radius: z.number().int(), coherenceMax: z.number().int(),
    tiles: z.array(tileSnapshotSchema), cogs: z.array(cogSnapshotSchema), commons: z.number().int(),
  })
  .strict();

export const turnEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rejected"), cog: z.string(), reason: z.string() }).strict(),
  z.object({ type: z.literal("transfer"), from: z.string(), to: z.string(), mineral: mineralSchema, amount: z.number().int() }).strict(),
  z.object({ type: z.literal("exploit"), cog: z.string(), tile: z.string(), mineral: mineralSchema, minted: z.number() }).strict(),
  z.object({ type: z.literal("capture"), tile: z.string(), from: cogIdNullable, to: cogIdNullable, coherence: z.number().int() }).strict(),
  z.object({ type: z.literal("auction"), winner: cogIdNullable, price: z.number().int(), bids: z.array(z.tuple([z.string(), z.number().int()])) }).strict(),
  z.object({ type: z.literal("starved"), cog: z.string(), tile: z.string(), coherence: z.number().int() }).strict(),
  z.object({ type: z.literal("mint"), cog: z.string(), gained: treasurySchema }).strict(),
]);

export const serverStatusSchema = z
  .object({ turn: z.number().int(), phase: phaseSchema, finished: z.boolean(), cogCount: z.number().int() })
  .strict();

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), snapshot: gameSnapshotSchema, backfill: z.boolean().optional() }).strict(),
  z.object({ type: z.literal("event"), event: turnEventSchema }).strict(),
  z.object({ type: z.literal("serverStatus"), status: serverStatusSchema }).strict(),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerStatus = z.infer<typeof serverStatusSchema>;
```

**Step 4: Run → PASS.** Then `npm run typecheck` (confirms `gameSnapshotSchema` structurally matches `GameSnapshot`).

**Step 5: Commit**
```bash
git add -A && git commit -m "feat: ServerMessage protocol (zod wire/replay contract)"
```

---

## Task 4: `recordGame` + replay envelope, wire into CLI `--out`

**Files:**
- Create: `src/shared/replay.ts`, `src/shared/replay.test.ts`
- Modify: `src/cli.ts` (write a `Replay` to `--out` instead of the lean log), `src/cli.test.ts`

**Step 1: Write the failing test**
```ts
// src/shared/replay.test.ts
import { describe, it, expect } from "vitest";
import { recordGame, makeReplay } from "./replay";
import { greedyAgent, peacefulAgent } from "../agents/stub";
import { serverMessageSchema } from "./protocol";
import { runGame } from "./engine/game";
import { toSnapshot } from "./snapshot";
import { MAX_TURNS } from "./engine/constants";

const agents = () => [greedyAgent("cog0"), peacefulAgent("cog1")];

describe("recordGame", () => {
  it("emits an initial snapshot + one per turn (MAX_TURNS+1)", () => {
    const frames = recordGame(7, agents());
    const snaps = frames.filter((f) => f.type === "snapshot");
    expect(snaps).toHaveLength(MAX_TURNS + 1);
  });
  it("every frame validates against the protocol", () => {
    for (const f of recordGame(7, agents())) expect(() => serverMessageSchema.parse(f)).not.toThrow();
  });
  it("last snapshot equals the engine's final state", () => {
    const frames = recordGame(7, agents());
    const last = [...frames].reverse().find((f) => f.type === "snapshot")!;
    const final = runGame(7, 2, agents());
    expect(last.type === "snapshot" && last.snapshot).toEqual(toSnapshot(final.state));
  });
  it("is deterministic for (seed, agents)", () =>
    expect(recordGame(7, agents())).toEqual(recordGame(7, agents())));
});

describe("makeReplay", () => {
  it("wraps frames with meta", () => {
    const r = makeReplay(7, ["greedy", "peaceful"], agents());
    expect(r.meta.seed).toBe(7);
    expect(r.meta.agents).toEqual(["greedy", "peaceful"]);
    expect(r.frames.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run → FAIL.** `npm test -- replay`

**Step 3: Implement**
```ts
// src/shared/replay.ts
// Record a full game as a ServerMessage[] stream (the replay), plus a small
// meta-wrapped envelope for on-disk storage. Same frames the live server emits.
import type { Agent } from "../agents/types";
import type { CogId } from "./engine/types";
import type { Order } from "./engine/orders";
import { newGame, stepTurn } from "./engine/game";
import { MAX_TURNS } from "./engine/constants";
import { toSnapshot } from "./snapshot";
import { COGHERENCE_VERSION } from "./version";
import type { ServerMessage } from "./protocol";

export interface ReplayMeta { version: string; seed: number; agents: string[]; turns: number; }
export interface Replay { meta: ReplayMeta; frames: ServerMessage[]; }

const status = (turn: number, phase: ServerMessage extends { status: infer S } ? S : never, finished: boolean, cogCount: number): ServerMessage =>
  ({ type: "serverStatus", status: { turn, phase, finished, cogCount } });

export function recordGame(seed: number, agents: Agent[]): ServerMessage[] {
  const frames: ServerMessage[] = [];
  let state = newGame(seed, agents.length);
  const n = agents.length;

  frames.push({ type: "snapshot", snapshot: toSnapshot(state) });
  frames.push({ type: "serverStatus", status: { turn: state.turn, phase: state.phase, finished: false, cogCount: n } });

  while (state.turn <= MAX_TURNS) {
    const ordersByCog: Record<CogId, Order[]> = {};
    for (const a of agents) ordersByCog[a.id] = a.commit({ state, me: a.id });
    state = stepTurn(state, ordersByCog);
    const rec = state.log[state.log.length - 1]!;
    for (const ev of rec.events) frames.push({ type: "event", event: ev });
    frames.push({ type: "snapshot", snapshot: toSnapshot(state) });
    frames.push({ type: "serverStatus", status: { turn: state.turn, phase: state.phase, finished: state.turn > MAX_TURNS, cogCount: n } });
  }
  return frames;
}

export function makeReplay(seed: number, agentSpecs: string[], agents: Agent[]): Replay {
  return { meta: { version: COGHERENCE_VERSION, seed, agents: agentSpecs, turns: MAX_TURNS }, frames: recordGame(seed, agents) };
}
```
> Note: delete the unused `status` helper above if you don't use it — the inline `serverStatus` pushes are clearer. (Kept the code minimal in the loop.)

**Step 4: Run → PASS.** `npm test -- replay`

**Step 5: Wire the CLI** — in `src/cli.ts`, replace the `--out` dump (`writeFileSync(opts.out, JSON.stringify(result.state.log, ...))`) with a replay:
```ts
import { makeReplay } from "./shared/replay";
// ...in main(), when opts.out is set:
const agents = buildAgents(opts.agents, opts.seed);
const replay = makeReplay(opts.seed, opts.agents, agents);
writeFileSync(opts.out, JSON.stringify(replay, null, 2));
console.log(`replay written to ${opts.out} (${replay.frames.length} frames)`);
```
Add a `cli.test.ts` case: parsing `--out` produces a file whose JSON has `meta.seed` and a non-empty `frames` array. (Write to a tmp path; assert then clean up.)

**Step 6: Verify + commit**

Run: `npm test && npm run typecheck`
Run: `npm run play -- --seed 7 --cogs 4 --out /tmp/cogherence-7.json` → prints "replay written…".
```bash
git add -A && git commit -m "feat: recordGame replay + cli --out writes ServerMessage frames"
```

---

## Task 5: Client tooling + hello-world mount

Add the vite/react/test toolchain (mirrors polis) and a minimal mounted app.

**Files:**
- Modify: `package.json` (deps + scripts), `tsconfig.json` (jsx + dom libs), `vitest.config.ts` (jsdom for `src/client/**`)
- Create: `index.html`, `vite.config.ts`, `src/client/main.tsx`, `src/client/App.tsx`, `src/client/App.test.tsx`

**Step 1: Add deps & scripts to `package.json`**

deps: `"react": "^18.3"`, `"react-dom": "^18.3"`.
devDeps: `"vite": "^5"`, `"@vitejs/plugin-react": "^4"`, `"@types/react": "^18"`, `"@types/react-dom": "^18"`, `"jsdom": "^24"`, `"@testing-library/react": "^16"`, `"@playwright/test": "^1.45"`.
scripts: add `"dev": "vite"`, `"build:web": "vite build"`, `"preview": "vite preview"`, `"smoke": "playwright test"`. (Keep `play`, `test`, `test:watch`, `typecheck`.)

**Step 2: `tsconfig.json`** — add `"jsx": "react-jsx"` and `"lib": ["ES2022", "DOM", "DOM.Iterable"]` to `compilerOptions`.

**Step 3: `vitest.config.ts`**
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [["src/client/**", "jsdom"]],
  },
});
```

**Step 4: `vite.config.ts`**
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  plugins: [react()],
  build: { outDir: "dist", rollupOptions: { input: { main: resolve(__dirname, "index.html") } } },
}));
```

**Step 5: `index.html`**
```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Cogherence</title></head>
  <body><div id="root"></div><script type="module" src="/src/client/main.tsx"></script></body>
</html>
```

**Step 6: Failing test + minimal app**
```tsx
// src/client/App.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the title", () => {
    const { getByText } = render(<App />);
    expect(getByText(/Cogherence/i)).toBeTruthy();
  });
});
```
Run → FAIL (no `./App`). Then:
```tsx
// src/client/App.tsx
// Root of the spectator client. Phase 1: loads a recorded replay and renders it.
import React from "react";
export function App(): React.ReactElement {
  return <h1>Cogherence</h1>;
}
```
```tsx
// src/client/main.tsx
// Browser entry: mount <App/> into #root.
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
createRoot(document.getElementById("root")!).render(<App />);
```

**Step 7: Verify + commit**

Run: `npm install`
Run: `npm test -- App` → PASS. `npm run typecheck` → clean. `npm run build:web` → emits `dist/`.
```bash
git add -A && git commit -m "chore: vite + react client scaffold (polis toolchain)"
```

---

## Task 6: Hex layout math (pure)

**Files:** Create `src/client/hex-layout.ts`, `src/client/hex-layout.test.ts`

**Step 1: Failing test**
```ts
// src/client/hex-layout.test.ts
import { describe, it, expect } from "vitest";
import { axialToPixel, hexCorners, polygonPoints } from "./hex-layout";

describe("hex-layout", () => {
  it("centers the origin hex at (0,0)", () =>
    expect(axialToPixel(0, 0, 10)).toEqual({ x: 0, y: 0 }));
  it("moving +r shifts down", () =>
    expect(axialToPixel(0, 1, 10).y).toBeGreaterThan(0));
  it("a hex has 6 corners", () =>
    expect(hexCorners(0, 0, 10)).toHaveLength(6));
  it("renders corners as an SVG points string", () =>
    expect(polygonPoints(hexCorners(0, 0, 10)).split(" ")).toHaveLength(6));
});
```

**Step 2: Run → FAIL.**

**Step 3: Implement** (pointy-top axial layout)
```ts
// src/client/hex-layout.ts
// Pure axial(q,r) -> pixel geometry for pointy-top hexes. No React, no DOM.
export interface Point { x: number; y: number; }

export function axialToPixel(q: number, r: number, size: number): Point {
  return { x: size * Math.sqrt(3) * (q + r / 2), y: size * (3 / 2) * r };
}
export function hexCorners(cx: number, cy: number, size: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) });
  }
  return pts;
}
export function polygonPoints(corners: Point[]): string {
  return corners.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}
```

**Step 4: Run → PASS. Step 5: Commit** `"feat: pointy-top hex layout math"`

---

## Task 7: `<HexBoard>` SVG component

**Files:** Create `src/client/colors.ts`, `src/client/HexBoard.tsx`, `src/client/HexBoard.test.tsx`

**Step 1: Failing test**
```tsx
// src/client/HexBoard.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HexBoard } from "./HexBoard";
import { toSnapshot } from "../shared/snapshot";
import { newGame } from "../shared/engine/game";

describe("HexBoard", () => {
  const snap = toSnapshot(newGame(7, 4));
  it("renders one polygon per tile", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    expect(container.querySelectorAll("polygon")).toHaveLength(127);
  });
  it("colors owned tiles by their cog", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    const filled = [...container.querySelectorAll("polygon")].filter(
      (p) => p.getAttribute("fill") !== "var(--neutral)",
    );
    expect(filled.length).toBeGreaterThan(0); // home tiles are owned
  });
});
```

**Step 2: Run → FAIL.**

**Step 3: Implement**
```ts
// src/client/colors.ts
// Stable per-cog palette by index; neutral tiles use a CSS var.
const COG_COLORS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#42d4f4"];
export const cogColor = (index: number): string => COG_COLORS[index % COG_COLORS.length]!;
```
```tsx
// src/client/HexBoard.tsx
// Renders a GameSnapshot as an SVG hex lattice: fill = cog color, opacity = coherence.
import React from "react";
import type { GameSnapshot } from "../shared/snapshot";
import { axialToPixel, hexCorners, polygonPoints } from "./hex-layout";
import { cogColor } from "./colors";

const SIZE = 14;

export function HexBoard({ snapshot, showMinerals = false }: { snapshot: GameSnapshot; showMinerals?: boolean }): React.ReactElement {
  const indexById = new Map(snapshot.cogs.map((c) => [c.id, c.index]));
  const centers = snapshot.tiles.map((t) => axialToPixel(t.q, t.r, SIZE));
  const xs = centers.map((c) => c.x), ys = centers.map((c) => c.y);
  const pad = SIZE * 2;
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad, h = Math.max(...ys) - minY + pad;

  return (
    <svg viewBox={`${minX} ${minY} ${w} ${h}`} width="100%" style={{ background: "#0b0b12" }}>
      {snapshot.tiles.map((t, i) => {
        const c = centers[i]!;
        const idx = t.alignment != null ? indexById.get(t.alignment) ?? 0 : null;
        const fill = idx === null ? "var(--neutral)" : cogColor(idx);
        const opacity = idx === null ? 0.12 : 0.25 + 0.75 * (t.coherence / snapshot.coherenceMax);
        return (
          <polygon
            key={`${t.q},${t.r}`}
            points={polygonPoints(hexCorners(c.x, c.y, SIZE))}
            fill={fill}
            fillOpacity={opacity}
            stroke="#000"
            strokeWidth={0.5}
          >
            {showMinerals && <title>{`${t.mineral} d${t.density} coh${t.coherence}`}</title>}
          </polygon>
        );
      })}
    </svg>
  );
}
```
> `"var(--neutral)"` resolves via a `:root { --neutral: #2a2a36 }` rule; add it in `index.html` `<style>` or a small `src/client/styles.css` imported by `main.tsx`.

**Step 4: Run → PASS. Step 5: Commit** `"feat: HexBoard SVG renderer"`

---

## Task 8: `ReplaySource` — parse frames, expose snapshots

**Files:** Create `src/client/replay-source.ts`, `src/client/replay-source.test.ts`

**Step 1: Failing test**
```ts
// src/client/replay-source.test.ts
import { describe, it, expect } from "vitest";
import { parseReplay, snapshots } from "./replay-source";
import { makeReplay } from "../shared/replay";
import { greedyAgent, peacefulAgent } from "../agents/stub";

const replay = () => makeReplay(7, ["greedy", "peaceful"], [greedyAgent("cog0"), peacefulAgent("cog1")]);

describe("replay-source", () => {
  it("parses + validates a replay object", () => {
    const r = parseReplay(JSON.parse(JSON.stringify(replay())));
    expect(r.meta.seed).toBe(7);
  });
  it("throws on a malformed frame", () =>
    expect(() => parseReplay({ meta: { version: "x", seed: 1, agents: [], turns: 1 }, frames: [{ type: "bogus" }] })).toThrow());
  it("extracts the ordered snapshot list", () => {
    const snaps = snapshots(parseReplay(replay()));
    expect(snaps.length).toBeGreaterThan(1);
    expect(snaps[0]!.turn).toBe(1);
  });
});
```

**Step 2: Run → FAIL.**

**Step 3: Implement** — validate at the boundary (fail loud on bad data).
```ts
// src/client/replay-source.ts
// Load + validate a recorded replay, and project it to the ordered snapshot list.
import { z } from "zod";
import { serverMessageSchema } from "../shared/protocol";
import type { GameSnapshot } from "../shared/snapshot";

const replaySchema = z
  .object({
    meta: z.object({ version: z.string(), seed: z.number(), agents: z.array(z.string()), turns: z.number().int() }).strict(),
    frames: z.array(serverMessageSchema),
  })
  .strict();
export type Replay = z.infer<typeof replaySchema>;

export function parseReplay(raw: unknown): Replay {
  return replaySchema.parse(raw); // throws on malformed input — intentional
}
export function snapshots(replay: Replay): GameSnapshot[] {
  return replay.frames.flatMap((f) => (f.type === "snapshot" ? [f.snapshot] : []));
}
```

**Step 4: Run → PASS. Step 5: Commit** `"feat: ReplaySource (validate + project snapshots)"`

---

## Task 9: `<Scrubber>`, meters, and `<App>` wiring

**Files:** Modify `src/client/App.tsx`, `src/client/App.test.tsx`; create `src/client/Scrubber.tsx`, `src/client/Hud.tsx`, `src/client/styles.css`

**Step 1: Failing test** — App renders a board + scrubber from an injected replay and seeks.
```tsx
// src/client/App.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { App } from "./App";
import { makeReplay } from "../shared/replay";
import { greedyAgent, peacefulAgent } from "../agents/stub";
import { parseReplay } from "./replay-source";

const replay = () => parseReplay(makeReplay(7, ["greedy", "peaceful"], [greedyAgent("cog0"), peacefulAgent("cog1")]));

describe("App", () => {
  it("renders the board for an injected replay", () => {
    const { container } = render(<App replay={replay()} />);
    expect(container.querySelectorAll("polygon")).toHaveLength(127);
  });
  it("steps the turn forward", () => {
    const { getByLabelText, getByTestId } = render(<App replay={replay()} />);
    const before = getByTestId("turn-label").textContent;
    fireEvent.click(getByLabelText("step forward"));
    expect(getByTestId("turn-label").textContent).not.toBe(before);
  });
});
```

**Step 2: Run → FAIL.**

**Step 3: Implement** — `App` accepts an optional `replay` prop (for tests) and otherwise `fetch`es `./replay.json`. `Scrubber` controls `index`; `Hud` shows commons + per-cog hearts/energy.
```tsx
// src/client/Scrubber.tsx
import React from "react";
export function Scrubber({ index, count, onSeek, playing, onTogglePlay }: {
  index: number; count: number; onSeek: (i: number) => void; playing: boolean; onTogglePlay: () => void;
}): React.ReactElement {
  return (
    <div className="scrubber">
      <button aria-label={playing ? "pause" : "play"} onClick={onTogglePlay}>{playing ? "⏸" : "▶"}</button>
      <button aria-label="step back" onClick={() => onSeek(Math.max(0, index - 1))}>◀</button>
      <input type="range" min={0} max={count - 1} value={index} onChange={(e) => onSeek(Number(e.target.value))} />
      <button aria-label="step forward" onClick={() => onSeek(Math.min(count - 1, index + 1))}>▶</button>
    </div>
  );
}
```
```tsx
// src/client/Hud.tsx
import React from "react";
import type { GameSnapshot } from "../shared/snapshot";
import { cogColor } from "./colors";
export function Hud({ snapshot }: { snapshot: GameSnapshot }): React.ReactElement {
  return (
    <div className="hud">
      <div data-testid="turn-label">Turn {snapshot.turn} / commons {snapshot.commons}</div>
      <ul>
        {snapshot.cogs.map((c) => (
          <li key={c.id} style={{ color: cogColor(c.index) }}>{c.id}: ♥{c.hearts} ⚡{c.energy}</li>
        ))}
      </ul>
    </div>
  );
}
```
```tsx
// src/client/App.tsx
import React, { useEffect, useState } from "react";
import "./styles.css";
import { HexBoard } from "./HexBoard";
import { Scrubber } from "./Scrubber";
import { Hud } from "./Hud";
import { parseReplay, snapshots, type Replay } from "./replay-source";

export function App({ replay: injected }: { replay?: Replay } = {}): React.ReactElement {
  const [replay, setReplay] = useState<Replay | null>(injected ?? null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (injected) return;
    fetch("./replay.json").then((r) => r.json()).then((j) => setReplay(parseReplay(j)));
  }, [injected]);

  const snaps = replay ? snapshots(replay) : [];
  useEffect(() => {
    if (!playing || snaps.length === 0) return;
    const id = setInterval(() => setIndex((i) => (i + 1 < snaps.length ? i + 1 : (setPlaying(false), i))), 250);
    return () => clearInterval(id);
  }, [playing, snaps.length]);

  if (!replay || snaps.length === 0) return <h1>Cogherence — loading replay…</h1>;
  const snap = snaps[Math.min(index, snaps.length - 1)]!;
  return (
    <div className="app">
      <h1>Cogherence</h1>
      <HexBoard snapshot={snap} />
      <Scrubber index={index} count={snaps.length} onSeek={setIndex} playing={playing} onTogglePlay={() => setPlaying((p) => !p)} />
      <Hud snapshot={snap} />
    </div>
  );
}
```
Add a minimal `src/client/styles.css` (`:root { --neutral: #2a2a36 } .app { font-family: system-ui; color: #ddd } .scrubber { display: flex; gap: 8px; align-items: center }`).

**Step 4: Run → PASS.** `npm test -- App` and full `npm test`. `npm run typecheck`.

**Step 5: Commit** `"feat: scrubber + hud + replay-driven App"`

---

## Task 10: Playwright smoke test

**Files:** Create `playwright.config.ts`, `tests/smoke/replay.spec.ts`; generate `public/replay.json`

**Step 1: Generate a bundled sample replay** (vite serves `public/` at the web root, so `fetch("./replay.json")` resolves):
```bash
mkdir -p public
npm run play -- --seed 7 --cogs 4 --out public/replay.json
```
Add `public/replay.json` to git (a deterministic fixture).

**Step 2: `playwright.config.ts`**
```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/smoke",
  fullyParallel: false,
  workers: 1,
  webServer: { command: "npm run build:web && npm run preview -- --port 4173", url: "http://localhost:4173", reuseExistingServer: false, timeout: 120_000 },
  use: { baseURL: "http://localhost:4173" },
});
```

**Step 3: Failing smoke test**
```ts
// tests/smoke/replay.spec.ts
import { test, expect } from "@playwright/test";
test("renders the lattice and scrubs", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("polygon")).toHaveCount(127);
  const before = await page.getByTestId("turn-label").textContent();
  await page.getByLabel("step forward").click();
  await expect(page.getByTestId("turn-label")).not.toHaveText(before ?? "");
});
```

**Step 4: Run → PASS.** `npx playwright install --with-deps chromium` (first run), then `npm run smoke`.

**Step 5: Commit** `"test: playwright smoke for replay client"`

---

## Task 11: Docs + PR

**Files:** Create `src/client/README.md`; update root `README.md` Status line; update `src/engine/README.md` path references (now `src/shared/engine`).

- `src/client/README.md`: how to record a replay (`npm run play -- --out public/replay.json`), run the viewer (`npm run dev`), the `ReplaySource`→`WorldSocket` swap planned for phase 3, and the module map.
- Root `README.md`: Status → "Engine MVP complete; replay/spectator client (phase 1) in `src/client`."
- Commit `"docs: replay client readme + status"`, then open a PR from this branch.

Then complete the branch with **superpowers:finishing-a-development-branch**.

---

## Milestones

- **M1 (Tasks 1–4):** Restructure + the recorded `ServerMessage[]` contract — the shared spine for phases 1/2/3.
- **M2 (Tasks 5–7):** Toolchain + the SVG hex renderer — the board appears.
- **M3 (Tasks 8–11):** Replay loading, scrubber/HUD, smoke test, docs — a watchable game.

## Notes for the executor

- In MVP, the headless engine doesn't expose intermediate phases, so every snapshot's `phase` is `"negotiate"` — fine for phase 1; per-phase frames arrive with the phase-3 server.
- Keep `src/shared/` free of React/DOM/Node imports — the client and (later) server both import it.
- If `recordGame` and `runGame` ever diverge, that's a bug: both must produce the same final state for `(seed, agents)`.
