# Cogherence Follow-ons — Design

**Date:** 2026-06-05
**Status:** Design (validated via brainstorming; pre-implementation)
**Builds on:** the merged engine MVP ([docs/plans/2026-06-04-cogherence-engine.md](2026-06-04-cogherence-engine.md)) and the game design ([docs/design.md](../design.md)).
**Convention source:** mirror `~/code/cogame-polis` (single-package TS, vite + React client, express + `ws` server, Bedrock LLM agents, zod at boundaries, fail-loud, deterministic seeded RNG).

---

## 1. Goal & scope

Build the three follow-on phases the engine plan deferred, toward one end state: **LLM Cogs negotiate and play, served live, watchable in a browser.**

**Build order (locked):** Phase 1 **Replay client** → Phase 2 **LLM agents** → Phase 3 **Live server**. Visualization first: we can see and debug every later piece. Each phase gets its own TDD implementation plan; this document is the shared architecture they all assume.

**Out of scope (for now):** persistence/DB, auth, tournaments, mobile. Add only when a phase needs it.

---

## 2. Key decision — one frame contract for replay *and* live

The most important pattern borrowed from polis: **a finished game and a live game are the same `ServerMessage[]` stream.** Polis's `ReplayRecorder` (`src/server/coworld/replay.ts`) buffers frames where each frame *is* a `ServerMessage` — the identical discriminated union (`src/shared/protocol.ts`) it broadcasts live over websockets. Snapshots are **full state**, not deltas.

We adopt this exactly. Define the contract once; reuse it across all three phases.

```ts
// src/shared/snapshot.ts — a full, serializable per-turn view (what a spectator sees)
interface TileSnapshot { q: number; r: number; alignment: CogId | null; coherence: number; mineral: Mineral; density: number; }
interface CogSnapshot  { id: CogId; index: number; hearts: number; treasury: Treasury; energy: number; } // energy = maxEnergy(treasury)
interface GameSnapshot {
  version: string;
  seed: number;
  turn: number;
  phase: Phase;
  radius: number;            // board radius (for axial->pixel layout)
  coherenceMax: number;      // for client glow scaling
  tiles: TileSnapshot[];     // all 127 tiles
  cogs: CogSnapshot[];
  commons: number;           // Σ coherence
}
export function toSnapshot(state: GameState): GameSnapshot;

// src/shared/protocol.ts — the wire/replay contract (zod-validated, mirrors polis)
type ServerMessage =
  | { type: "snapshot"; snapshot: GameSnapshot; backfill?: boolean }
  | { type: "event";    event: TurnEvent }            // existing Resolve/Upkeep events
  | { type: "serverStatus"; status: ServerStatus };
interface ServerStatus { turn: number; phase: Phase; finished: boolean; cogCount: number; }
```

- **Phase 1:** the engine records `ServerMessage[]` to a `.json` replay file; the React client renders from it.
- **Phase 3:** the live server streams the *same* messages over `ws`; the client's frame consumer is unchanged.
- **Phase 2 (LLM games):** these are **not** reproducible in-browser (moves call Bedrock), so frames must be *recorded*, not re-run. This contract is the only model that handles all three.

---

## 3. Repo restructure (full polis mirror)

Single package, no workspaces (polis-style). Move the pure core under `src/shared/`; add client and server trees.

```
src/
  shared/                  # pure, deterministic, no I/O — runs on client & server
    engine/                # MOVED from src/engine/: rng, hex, board, energy,
                           #   coherence, orders, resolve, upkeep, game
    types.ts  constants.ts  log.ts          # moved to shared top-level
    snapshot.ts            # NEW: GameSnapshot + toSnapshot
    protocol.ts            # NEW: zod ServerMessage / ServerStatus
    replay.ts              # NEW: recordGame(seed, agents) -> ServerMessage[]
  agents/                  # Agent interface + stub policies (existing); + Bedrock agent (phase 2)
  client/                  # NEW: React + vite SPA (phase 1)
  server/                  # NEW: express + ws (phase 3)
  cli.ts                   # existing; --out now writes the replay file
index.html                 # NEW: client entry (multi-entry per-cog views added in phase 3)
vite.config.ts             # NEW
tsconfig.json              # client (Bundler resolution)
tsconfig.node.json         # NEW: server build -> dist-server (NodeNext)
```

The Step-0 move keeps the **109 existing tests green** (path-only refactor: move files, update imports, re-run). Tests stay co-located (`*.test.ts`); React component tests use vitest's `jsdom` env; Playwright owns `*.spec.ts` smoke tests.

---

## 4. Toolchain (mirror polis `package.json` / `vite.config.ts`)

- **Deps added:** `react`, `react-dom`, `express`, `ws`, `@aws-sdk/client-bedrock-runtime`, `nanoid`. **Dev:** `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@types/express`, `@types/ws`, `jsdom`, `@playwright/test`.
- **Scripts:** `dev` (run a game / serve), `dev:llm` (same with AWS profile+region env), `build` (`tsc -p tsconfig.node.json && vite build`), `start` (`node dist-server/cli.js`), `test` (`vitest run`), `test:watch`, `smoke` (`playwright test`), `check` (`test && build`).
- **Vite:** `base: command === "build" ? "./" : "/"`; `rollupOptions.input` per HTML entry; `@vitejs/plugin-react`.
- **Bedrock config:** model id / region / timeout from env (default haiku for Cogs, region `us-west-2`); never read env inside libraries — pass config in.

---

## 5. Phase 1 — Replay client (detailed)

**Deliverable:** run a recorded game (stub or, later, LLM) and watch the hex lattice evolve in the browser, scrubbing turn-by-turn.

**Step 0 — Restructure + tooling.** Move `src/engine/*` → `src/shared/` per §3; update imports; `npm test` stays green. Add vite/react/playwright tooling and the two tsconfigs.

**Step 1 — Contract + recorder (engine-side, TDD).**
- `src/shared/snapshot.ts` (`GameSnapshot`, `toSnapshot`).
- `src/shared/protocol.ts` (zod `ServerMessage`, `ServerStatus`).
- `src/shared/replay.ts`: `recordGame(seed, agents) → ServerMessage[]` — an initial snapshot, then per turn: the turn's `event` frames, the post-turn `snapshot`, and a `serverStatus` (matching polis's event→snapshot→status order). CLI `--out game.json` writes `{ meta, frames }` (replaces today's lean log dump).
- **Tests:** replay holds `MAX_TURNS` post-turn snapshots; every frame `ServerMessage.parse`s; the final snapshot deep-equals `toSnapshot(finalState)`; recording is deterministic for `(seed, agents)`.

**Step 2 — React client (`src/client/`, TDD vitest+jsdom).**
- `index.html` + `vite.config.ts` (single entry now).
- **Hex render:** axial `(q,r)`→pixel math (pure, unit-tested), one SVG `<polygon>` per tile; fill = cog color (stable per index), glow/opacity = `coherence / coherenceMax`, neutral = dim; mineral-overlay toggle (C/O/Ge/S + density).
- **Controls:** a polis-style `Scrubber` (play/pause, step, `pinnedTurn`); a commons meter; a per-cog hearts/energy panel.
- **`ReplaySource`:** reads `frames` from a file/URL and exposes the current `GameSnapshot` + a `seek(turn)`. Phase 3 swaps in a `WorldSocket` over `ws` behind the same interface — **no render changes**.
- **Playwright smoke:** load a bundled sample replay; assert 127 tiles render and scrubbing advances the turn label.

**YAGNI cuts (v1):** no public/DM feeds (no negotiation data until phases 2–3), no per-cog redacted views, no reveal-animation polish (plain CSS transition), no DB/persistence.

---

## 6. Phase 2 — LLM agents (Bedrock) — sketch

Implements the design doc's §14 agent interface for real models, following polis's `bedrockToolLoop`.

- `src/agents/bedrock.ts`: Bedrock `Converse` client factory (mirror polis `controllers/tool-client.ts`).
- `src/agents/llm-agent.ts`: implements `Agent`. Serialize `AgentView` (board + own private treasury, design doc §14.1) → prompt; run a tool-use loop with a **terminal `submit_orders` tool**; parse the result through the existing zod `OrderSchema` → `Order[]`. **Fail-safe:** malformed/timeout → no orders, bid 0 (§14.3) — never throws.
- Model id / region / timeout from env; `dev:llm` sets AWS profile+region. Default haiku.
- **Limitation (documented):** Negotiate is still a no-op stub here — Cogs play the board but don't talk until phase 3 provides channels. LLM games still record a replay, so they're watchable in the phase-1 client immediately.

---

## 7. Phase 3 — Live server (ws) — sketch

Turns the recorded contract into a live one and unlocks the politics.

- `src/server/`: express + `ws`, mirroring polis `http.ts` / `websocket.ts` / `game-runner.ts` / `runtime.ts`. One game per server (no multi-room for v1).
- `GameRunner` holds the live `GameState`, advances phases, and **broadcasts the same `ServerMessage` frames**: `/global/ws` (operator, full snapshots) and `/cog/:id/ws` (redacted per-cog view = the §14.1 observation: own treasury, own DMs — fog of war via a `buildCogSnapshot`).
- **The Negotiate phase becomes real:** public broadcast channel + private DMs (polis `messages.ts` / disclosure pattern). This is what surfaces cheap-talk politics and the public-vs-DM duplicity signal (design doc §9). A phase coordinator waits for each Cog's submission or a deadline (§14.5 negotiate budget).
- Client: swap `ReplaySource` → `WorldSocket`; identical rendering. Per-cog HUD views reuse the snapshot renderer with the redacted snapshot.

---

## 8. Conventions to follow (from polis)

- **kebab-case** files/dirs; **PascalCase** types; **camelCase** functions; zod schemas `camelCaseSchema`.
- **zod at every boundary**; validate inbound → drop if invalid, validate outbound → throw.
- **Fail loud.** No error-swallowing try/catch (only `try/finally` for cleanup). LLM responses are the one fail-*safe* path (default, never crash the game).
- **Determinism:** pure `src/shared/` (no `Date.now()`/`Math.random()`/I/O); seeded RNG threaded through state.
- **Module header comment** (1–2 lines) on every file; discriminated unions for messages/events/orders; minimal diffs, delete dead paths.

---

## 9. Data flow (all phases)

```
            ┌────────────── src/shared (pure engine + contract) ──────────────┐
 seed,agents│  newGame → stepTurn(resolve→upkeep)  →  toSnapshot → ServerMessage│
            └───────────────┬───────────────────────────────┬─────────────────┘
                            │ recordGame (P1/P2)              │ GameRunner broadcast (P3)
                            ▼                                 ▼
                   game.json (frames)                  /global/ws, /cog/:id/ws
                            │                                 │
                            └──────────► same ServerMessage consumer ◄──────────┘
                                   src/client: ReplaySource | WorldSocket
                                   → SVG hex lattice + scrubber + meters
```

---

## 10. Open questions / tunables

- Replay file envelope: bare `ServerMessage[]` vs `{ meta, frames }` (lean toward `{ meta, frames }` so seed/agents/version travel with it).
- Cog colors: fixed palette by index (start here) vs derived.
- Per-cog redaction details for phase 3 (what exactly a Cog sees of others — hearts public, treasury private per §14.1).
- Negotiate transport: structured message objects vs free text + parsing (phase 3 decision).
- Whether stub-agent games also exercise `dev:llm` paths (no — keep scripted path creds-free, like polis `dev`).
