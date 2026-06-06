# Cogherence Live Dashboard + Multi-LLM — Design

**Date:** 2026-06-05
**Status:** Design (validated via brainstorming; pre-implementation)
**Builds on:** the merged engine + replay client + LLM-agent prompt pipeline, and the [follow-ons design](2026-06-05-cogherence-followons-design.md) (this supersedes its Phase-2/3 sketches with the full plan). Game design: [docs/design.md](../design.md).
**Convention source:** mirror `~/code/cogame-polis` — live HTTP + `ws` server, in-process Bedrock cog agents, per-cog redaction, multi-view React dashboard, act-prompt transparency.

---

## 1. Goal & scope

Replicate polis's **full live dashboard + multi-LLM setup** for cogherence: a server that drives a live game with multiple LLM Cogs that **talk and scheme** (free-form, reactive negotiation), broadcast over websockets to a multi-view dashboard that surfaces the board, the scoreboard, the chat, and **exactly what each LLM saw and decided**.

**In scope:** live server (HTTP + ws), async game-runner + phase coordinator with per-cog deadlines, in-process Bedrock cog agents, free-form reactive negotiation (public + DM message bus), per-cog snapshot/message redaction (fog of war), act-prompt/transcript transparency, a multi-view dashboard (operator/global, per-cog, feed/chat), replay-over-ws, and basic operator steering (editable prompts, reset/kick).

**Skipped (polis game-specific, no analogue here):** datacenters/facilities, research/projects, laws/voting, judges/governors, prices/shares, the governance dashboard view.

**Build incrementally** — Phases A–D below, each its own TDD implementation plan and merge. The dependency order puts negotiation last (it needs the server, agent driver, and dashboard to carry it).

---

## 2. Architecture (single package, polis layout)

```
src/
  shared/                      # pure, deterministic, no I/O (client + server import)
    engine/                    # existing
    snapshot.ts protocol.ts    # existing; EXTENDED (messages, actPrompt, richer status)
    messages.ts                # NEW: Message type + visibility helper
  agents/
    llm/                       # existing (tool-client, render, submit, llm-agent)
  server/                      # NEW — all I/O
    runtime.ts                 # startServer(): wire engine + runner + http + ws
    game-runner.ts             # live async turn loop; emits GameRunnerUpdate
    phase-coordinator.ts       # collect-with-deadline across cogs
    cog-state-store.ts         # per-cog observable state + waitNext + deadline arm
    message-bus.ts             # route public/DM posts; record; notify subscribers
    cog-agent.ts               # in-process LLM driver (reactive responder + commit)
    act-prompt-log.ts          # per-cog "what the brain saw" (bounded)
    transcript-log.ts          # per-cog Bedrock message log
    http.ts                    # express: static client + operator API
    websocket.ts               # /global/ws, /cog/:id/ws, /replay
  client/                      # existing replay client, EXTENDED to multi-view + live
    net/world-socket.ts        # NEW: live ServerMessage socket (reconnect)
    net/feed.ts                # NEW: connectLiveFeed -> mutable store -> re-render
    ui/global-view/            # NEW: operator console (roster, ticker, charts)
    ui/cog-view/               # NEW: per-cog console (HexBoard + PromptsPanel + Inbox)
    ui/feed-view/              # NEW: chat/event console
    ui/shell/                  # NEW: AppHeader, ErrorBoundary, ViewSwitcher, nav
  cli-serve.ts                 # NEW: `serve` entry (seed, cogs, port, agents)
index.html index-cog.html index-feed.html   # NEW client entry points (multi-entry vite)
```

`tsconfig.node.json` (NodeNext → `dist-server`) is added now for the server build; `build` becomes `tsc -p tsconfig.node.json && vite build` (mirrors polis).

---

## 3. Data model — messages + protocol extensions

Messages live in **shared state** so they ride snapshots into replays and the dashboard.

```ts
// src/shared/messages.ts
export type Audience = "public" | CogId;       // DM target or broadcast
export interface Message { seq: number; turn: number; from: CogId; to: Audience; text: string; }
/** A cog sees a message iff it's public, or it is the sender or recipient. */
export function messageVisibleToCog(m: Message, cog: CogId): boolean;
```

`GameState` gains `messages: Message[]` (bounded tail); `GameSnapshot` carries the visible slice. `protocol.ts` `ServerMessage` gains:
- `{ type: "message"; message: Message }`
- `{ type: "actPrompt"; cogId; turn; phase; content }` — what a brain saw (transparency).
- `serverStatus` extended: `phase`, `finished`, `pending: CogId[]`, `done: CogId[]`, `phaseDeadlineAt?`, `cogCount`, `clientCount`.

Per-cog redaction = `buildCogSnapshot(state, cog)` (own treasury full, others' hearts public, own DMs only) + `messageVisibleToCog`. **One redaction path for live, replay, and fog-of-war.**

---

## 4. Live game loop (`game-runner.ts`)

Per turn, async:
1. **Negotiate window** (§5): open a deadline-bounded free-form messaging window; reactive agents post public/DM messages via the bus; broadcast each message live; close on deadline or when all cogs "pass".
2. **Commit barrier:** `phase-coordinator.collect("commit", deadline)` — each cog submits `Order[]` or defaults to `[]` on timeout. Concurrent across cogs (`Promise.all` of per-cog arms).
3. **Resolve → Upkeep:** the existing pure engine (`resolve`, `upkeep`).
4. **Broadcast:** emit `event`/`snapshot`/`serverStatus` frames (the existing `ServerMessage` triad) after Resolve and Upkeep.

The runner owns `GameState`, the per-cog `CogStateStore`s, the `MessageBus`, and an `onUpdate` subscriber list (websocket fan-out subscribes). Game ends at `MAX_TURNS`; scoring via existing `scoreGame`.

**Phase coordinator / deadlines (polis pattern):** each cog's store carries its own deadline arm; `collect` resolves as soon as every cog has submitted *or* its arm times out (→ safe default). No central timer.

---

## 5. Free-form reactive negotiation (`message-bus.ts` + `cog-agent.ts`)

The Negotiate window is a wall-clock window (default ~20s, tunable) bounded additionally by a **per-cog message budget** (e.g. ≤ N posts/turn) and **token budget**, so chatter can't run forever.

- **MessageBus:** `post({from, to, text})` → validate, stamp `seq`, append to state, fan out to the dashboard (`message` frame) and to recipient cog stores (so reactive agents wake).
- **Reactive responder (cog-agent):** during the window each in-process LLM agent loops: on window-open and on each newly-visible message, it may call the model with a **negotiate prompt** (board + recent visible messages + its private context + "post messages or pass") and either `post` messages or `pass`. Once it passes and nothing new arrives, it's idle; the window closes when all idle or the deadline hits.
- **Determinism:** scripted/stub agents post nothing (or fixed lines) → deterministic. LLM negotiation is non-deterministic and wall-clock-timed; the **replay records the actual message/order frame sequence**, so the dashboard reproduces any game exactly even though live timing isn't reproducible.

Scripted agents implement a no-op negotiate; only LLM agents converse. The Agent interface gains an optional reactive hook; the server (not the pure engine) drives the window.

---

## 6. Multi-LLM orchestration

- **In-process driver** (`cog-agent.ts`): one async task per LLM cog, blocking on its `CogStateStore.waitNext()`. On a pending commit → render view (`renderView`) → `bedrock` tool-use (`llmDecide`) → submit. During negotiate → reactive responder loop.
- **Concurrency:** all cogs' commit decisions run concurrently per turn (`Promise.all`); negotiation is event-driven and concurrent.
- **Model config:** Bedrock haiku for cogs (env-configurable, reuse `bedrockConfigFromEnv`); `serve:llm` script sets AWS region/profile. Scripted stubs need no creds (mirrors polis `dev` vs `dev:llm`).
- **Fail-safe:** every model interaction defaults safely (no orders / no message) and never throws — a flaky model never stalls the game (extends the existing `llmDecide` contract). A cog that defaults repeatedly is flagged unhealthy in `serverStatus`.
- **Transparency:** `act-prompt-log` records what each brain saw per (turn, phase); `transcript-log` records the raw Bedrock messages. Both surface in the per-cog console and bake into replays.

---

## 7. Websocket fan-out (`websocket.ts`)

- `/global/ws` — operator: every snapshot (full), every event, every message, status.
- `/cog/:id/ws` — per-cog: redacted snapshot, only `messageVisibleToCog`, visible events, status. Redaction computed once per (state, cog).
- `/replay` — burst recorded frames; per-cog projection reuses the same redaction.
- **Head-first sync on connect:** current snapshot → status → head events → backfilled earlier snapshots (flagged) → older events (polis pattern, so the scrubber has history).
- Client: `world-socket.ts` (reconnect/backoff) + `feed.ts` `connectLiveFeed(store, makeSocket, onChange)` mutate a plain store and trigger re-render. The existing `ReplaySource` becomes one of two feeds behind the same snapshot list.

---

## 8. Dashboard (multi-view)

Reuses `HexBoard`/`Scrubber`/`Hud`; adds a shell (`AppHeader`, `ErrorBoundary`, `ViewSwitcher`, `nav`).
- **Global / operator** (`index.html`): the hex board + roster (hearts/energy/health), commons meter, a live **activity ticker** (events + messages), standings, turn scrubber. Full state, no redaction.
- **Per-cog** (`index-cog.html`, `/cog/:id`): the board from that cog's view + **PromptsPanel** (the act-prompt transparency — what the LLM saw + its thoughts) + **Inbox** (its visible messages/DMs).
- **Feed / chat** (`index-feed.html`): the public + (own) DM stream as a chat console — the public-vs-DM duplicity on display.

---

## 9. Testing & determinism

- **No network in tests:** inject a fake `ToolUseClient` (already established) and a fake clock/deadline; the server's collect/deadline logic is tested with controllable timers.
- **Deterministic engine tests** stay green (scripted agents, no messages).
- **Server unit tests:** phase coordinator (submit vs timeout→default), message bus (routing + redaction), game-runner (a scripted live game produces the expected frame stream), redaction (`buildCogSnapshot`/`messageVisibleToCog`).
- **Client:** vitest + jsdom for views; Playwright smoke drives a live scripted server (a few turns) and asserts the board + ticker + a posted message render.
- **Fail-loud everywhere except the LLM seam** (the one sanctioned fail-safe path).

---

## 10. Build sequence (each = its own implementation plan + merge)

> **Implementation status (2026-06-05): Phases A–D all shipped and verified live.**
> The dashboard runs live Bedrock Cogs that negotiate (public + DM), shows what
> each brain saw, and is operator-steerable. Build notes per phase below.

- **Phase A — Live server core. ✅** `protocol`/`snapshot` extended; `cog-state-store`, `phase-coordinator`, `game-runner` (commit barrier + deadline), `http` + `websocket` (`/global/ws`, `/cog/:id/ws` redaction), `runtime`, `cli-serve`; client `world-socket` + `feed`. → live scripted game in the browser.
- **Phase B — Multi-LLM in-process + transparency. ✅** in-process Bedrock agents (`agents/llm/*`), `act-prompt-hub` transparency, the **per-cog console** (PromptsPanel) + **operator/global console** + shell/ViewSwitcher; `serve:llm`. → live LLM Cogs play, with each brain's prompt+decision on display.
- **Phase C — Free-form negotiation. ✅** `messages.ts`, message frames, `message-bus`, the Negotiate round + reactive responders, the **feed/chat view**, per-cog message redaction. → the Cogs scheme (public + DM), verified live (alliances, threats, betrayal).
- **Phase D — Operator steering + replay. ✅** Live-editable per-cog **persona** (`SteeringStore`, prepended to the prompt and re-read every turn) + **pause/kick** (`pausableAgent`); operator **reset** (`GameRunner.reset()` with a generation guard; client clears history on a backwards turn); and the live server **records its own game**, served at `GET /replay.json` (`ReplayRecorder`) so a finished LLM game is re-watchable in the existing replay client. Operator API: `GET|POST /cog/:id/steering`, `POST /reset`. → set a persona mid-game and watch the LLM flip behavior on the next turn; reset for a fresh match; replay what just happened. *Deferred:* a dedicated `/replay` **websocket** (the static-file replay path already covers re-watching, including live-recorded games) and **server-side** per-cog board redaction in replay (CogView already redacts the inbox client-side).

---

## 11. Conventions (from polis)

kebab-case files; zod at every boundary (drop invalid inbound, throw on invalid outbound); **fail loud** except the LLM fail-safe; deterministic seeded engine; discriminated-union messages/events; per-observer redaction; module header comments; minimal diffs.

---

## 12. Open questions / tunables

- Negotiate window length + per-cog message/token budget defaults.
- Whether messages persist across turns in the snapshot (bounded tail length).
- One server = one game (MVP) vs rooms (later).
- Replay file growth with messages (frame volume); compression later.
- Operator auth for steering endpoints (none for local MVP).
