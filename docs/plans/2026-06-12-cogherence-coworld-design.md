# Cogherence as a Softmax Coworld — Design

**Date:** 2026-06-12
**Goal:** Package the existing Cogherence game as a Softmax **Coworld** (Tournament v2),
upload it to the production platform, and submit an LLM player to a league.

## What "good" means (the derivation chain)

Cogherence's definition of success is fixed by the rules: **most hearts at the final turn wins.**
That is the match-scoring signal and the basis of the `results` artifact. Everything else
(player policy, future reporters/graders/optimizer) derives from improving hearts-at-end play.

For v1 we ship the **required** roles only — `game`, `player[]`, `variants[]`, `certification` —
plus a `commissioner` (the platform's game-agnostic default) so a league can run round-robins.
Reporters/graders/diagnoser/optimizer are deferred (optional today) and noted as follow-ons.

## Principle: reuse the engine, add an adapter — don't rewrite

Cogherence already has every piece a Coworld needs; the only true gap is that its policies run
**in-process** while a Coworld runs **external player containers** that connect over WebSocket.

Keep unchanged:
- `src/shared/engine/**` — the pure deterministic game engine and `scoreGame`.
- `src/shared/snapshot.ts`, `src/server/redact.ts` — per-cog fog-of-war projection (opponents'
  treasury/energy zeroed; bids sealed per viewer).
- `src/server/message-bus.ts` — public/DM cheap-talk with per-cog visibility.
- `src/shared/replay.ts` + `src/server/replay-recorder.ts` — the replay envelope
  (`{meta, frames: ServerMessage[]}`), which is already the live `/global` frame stream and what
  the client's replay view consumes.
- `src/agents/llm/**` — the fail-safe LLM agent (`llmNegotiate`/`llmDecide`).
- `src/client/**` — the React dashboard (Global / Feed / Cog / replay scrubber).

Add (new `src/coworld/` module):
- The Coworld **game entrypoint** (config load, required routes, results/replay IO).
- A **WS player protocol** mirroring the `Agent` interface.
- A **`RemotePlayerAgent`** (the seam).
- The **reference LLM player** container entry.
- Dockerfile, `compose.yaml`, manifest template, protocol-spec docs.

## The seam: `RemotePlayerAgent`

`GameRunner` consumes objects implementing `Agent { id; negotiate(view); commit(view) }` and calls
them each turn. We implement an `Agent` whose `negotiate`/`commit` **send the redacted view over
that slot's player WebSocket and await the reply**, with the same deadline behaviour the runner
already enforces (a slow/absent player resolves to `[]` — no orders, bid 0). The game entrypoint
builds N `RemotePlayerAgent`s (one per slot) and hands them to an **unmodified** `GameRunner`.

This means the entire turn loop, scoring, redaction, recording, and steering logic is reused
verbatim. The only behavioural change: agents are remote and answer over the wire.

Redaction note: today the in-process runner passes each agent the **full** `GameState`. For a
fair tournament we send each remote player only its **redacted** view (`buildCogSnapshot` +
`bus.visibleTo`). The `RemotePlayerAgent` is wired in the game entrypoint, which has access to the
recorder/redaction, so it projects per-slot before sending.

## Player WS protocol (`game ⇄ player`, JSON over `/player?slot=&token=`)

On connect (after slot/token validation):
- `game → player`: `{ "type": "hello", "slot", "you": "<cogId>", "name", "rules": "<orientation text>", "config": {...} }`

Each turn:
- `game → player`: `{ "type": "negotiate", "turn", "view": <AgentView JSON> }`
  `player → game`: `{ "type": "negotiate_result", "turn", "posts": [{ "to", "text" }] }`
- `game → player`: `{ "type": "commit", "turn", "view": <AgentView JSON> }`
  `player → game`: `{ "type": "commit_result", "turn", "orders": [<Order>...] }`

`view` = `{ state: <redacted GameSnapshot/GameState>, me: "<cogId>", messages: [<visible Message>...] }`.
At game end: `game → player`: `{ "type": "final", "results": {...} }`; the player exits cleanly.
Bad/duplicate token → WebSocket close `1008`.

The protocol intentionally mirrors `Agent.negotiate`/`Agent.commit` so the reference player is a
thin loop around the **existing** `llmNegotiate`/`llmDecide`. Replies are deadline-bounded server
side; a missing reply defaults to `[]`.

## Required Coworld game routes (`COGAME_HOST:COGAME_PORT`, default `0.0.0.0:8080`)

- `GET /healthz` → 200 once config is loaded and the server is listening.
- `GET /client/global` → the live dashboard (Global/Feed); browser viewer connects to **WS `/global`**.
- `GET /client/player?slot=&token=` → that slot's fog-of-war spectator view (the existing Cog view).
- `GET /client/replay` → the replay dashboard; **auto-plays and loops**; streams **WS `/replay`**.
- `WS /player?slot=&token=` → the policy protocol above (external player containers).
- `WS /global` → full live frame stream (reuse the existing fan-out).
- `WS /replay` → streams the replay loaded from `COGAME_LOAD_REPLAY_URI`.

Env contract: read `COGAME_CONFIG_URI` at startup; write `results.json` to `COGAME_RESULTS_URI` and
replay bytes to `COGAME_SAVE_REPLAY_URI` at episode end; in replay mode `COGAME_LOAD_REPLAY_URI` is
set (no players, no results). Support `COGAME_RESULTS_METHOD`/`COGAME_SAVE_REPLAY_METHOD` (PUT/POST)
and `file://`/`http(s)://` URIs, like PaintArena.

Client serving: `vite build` produces static assets served by Express (no Vite middleware in the
container). The client's live WS endpoint changes from `/global/ws`→`/global` and the cog view from
`/cog/:id/ws`→a `/global`-with-slot or kept `/cog/:id/ws` alias; replay file load stays `/replay.json`
or switches to the `/replay` WS in replay mode.

## `game.config_schema`

Required: `tokens` (fixed-length `string[]` — **defines slot count**), `players` (fixed-length
`[{ name }]`). Plus game knobs: `seed` (int), `max_turns` (int), `deadline_ms` (int, per-phase),
`negotiate_rounds` (int), `player_connect_timeout_seconds` (number, default 180).
`additionalProperties: false`. Three variants by `tokens` length: **4 (default)**, **3**, **6**.

## `game.results_schema`

`{ scores: number[] (hearts per slot, slot-ordered), winner: integer|null (slot index), turns: integer }`,
`additionalProperties:false`. Derived from `scoreGame(state)` standings mapped to slot order.

## Reference LLM player

`player-main.ts`: connect to `COWORLD_PLAYER_WS_URL`; on `hello` capture identity; on
`negotiate`/`commit` build an `AgentView` from `view` and call the existing `llmNegotiate`/`llmDecide`
with a Bedrock `ToolUseClient`. Fail-safe: no Bedrock creds → caught → `[]` (passive play), so the
episode always completes. Persona optional via env. Exit on `final`.

Bedrock credentials: **never** baked into the image or manifest env (public). Local runs use
`coworld ... --use-bedrock`; hosted league runs use `coworld upload-policy --use-bedrock`
(`--bedrock-model`), which grants the player pod the tournament Bedrock IAM role.

## Docker

Single multi-stage Node 20 image (`--platform=linux/amd64`): stage 1 `npm ci` + `vite build`
(static client) + compile/bundle server & player TS; final stage runs either entrypoint. Game CMD =
the game entrypoint; player `run` override = the player entrypoint. `compose.yaml` builds this image
plus references the platform's default commissioner image.

## Episode timing vs. the 20-minute hosted deadline

Each turn = one negotiate wave + one commit wave; all 4 players answer **concurrently**, so a turn
costs ~2 sequential Bedrock round-trips (~30s with Haiku). Default variant `max_turns` is chosen to
stay well under 20 min (≈ 20–25 turns); the **certification** fixture uses a short `max_turns`
(≈ 8) and short `deadline_ms` so cert is a fast smoke test (and passes even with no Bedrock —
players play passively, the game still finishes and writes results + replay).

## Submit plan (prod)

1. `docker build --platform=linux/amd64 -t cogherence:local .`
2. `coworld build compose.yaml coworld_manifest_template.json <ver> tmp/coworld_manifest.json`
3. `coworld run-episode tmp/coworld_manifest.json` (smoke) → then `coworld certify ...`
   (and once with `--use-bedrock` to see real LLM play + a real replay).
4. `coworld upload-coworld tmp/coworld_manifest.json` (production default server).
5. `coworld upload-policy cogherence:local --name "$USER-cogherence-llm" --run ... --use-bedrock
   --bedrock-model <id>` then `coworld submit ... --league <league_id>` (creating/locating a
   suitable league; verify placement with `coworld submissions --mine`).

## Review corrections (coworlds-expert, 2026-06-12)

A coworlds-expert review of this design surfaced fixes now baked into the build:

- **Redaction (was the big risk):** done — `src/coworld/redact-state.ts` `redactStateFor(state, viewer)`
  projects a per-slot **`GameState`** (zeroes rivals' treasury/energy, drops `log`). `RemotePlayerAgent`
  sends that; the player calls the existing `renderView`/`llmDecide` unchanged.
- **Certification wall-clock is 60s, not 20min.** Cert default `--timeout-seconds=60`. The certification
  fixture is therefore **tiny**: `max_turns: 2`, `negotiate_rounds: 0`, modest `deadline_ms`. The real-LLM
  showcase uses `coworld play` / `run-episode --timeout-seconds <big>` (and `--use-bedrock`), **not** cert.
- **Turn-budget math.** Negotiate runs **sequentially within one shared `deadline_ms` window** (so per-turn ≤
  ~`2×deadline_ms`, bounded regardless of slot count); commit fans out concurrently. Default variant sizes
  `deadline_ms`/`max_turns` to stay well under the 20-min hosted deadline (e.g. `deadline_ms 15000`,
  `max_turns 20` ≈ 10 min).
- **Bad token →** actively `close(1008)` within 2s (the runner's preflight fails if the socket hangs).
- **Exact routes required:** `/client/player`, `/client/global` must return **200** (no redirect; only
  `/client/replay` may redirect); WS `/player`, `/global`, `/replay`. `/replay` must emit a frame on connect
  and `/client/replay` must **auto-play + loop**.
- **Connect-timeout auto-start (`player_connect_timeout_seconds`, default 180):** start the episode when all
  slots connect **or** after the timeout; never-connected/dropped slots are passive `[]` players.
- **Late/mismatched player replies dropped;** disconnect → that slot resolves `[]` for the rest (fail-safe,
  no try/except swallowing).
- **`results.winner` is a slot index** (translate `scoreGame`'s `CogId` → slot); `scores` length bounded
  `minItems:3,maxItems:6` across variants.
- **Manifest template omits `game.version`** (`coworld build` injects it and errors if present).
- **`source_url` omitted** for v1 (repo is private; a `github.com` `source_url` is strictly validated to
  contain a Dockerfile). Add later when public.

## Update (2026-06-13): async chat, no negotiate phase

The synchronous negotiate phase described above was removed. The Coworld now runs
`negotiate_rounds: 0` (GameRunner skips the negotiate phase entirely; the original
app keeps it for `> 0`), and chat is **fully asynchronous**: a player may send
`{type:"message", to, text}` over its WebSocket at any time; the game-server posts
it to the bus and pushes visible `{type:"message", message}` frames to other
players live. The reference player makes **one** model call per `commit` offering
both `submit_orders` and `send_messages` (parallel tool use) → a `commit_result`
plus async `message` frames. This halves model calls per turn and decouples chat
from turn structure. `negotiate`/`negotiate_result` frames are gone.

## Risks / open items

- **Client static serving + WS path** is the main new surface; the rest is config/glue over reused
  code. Mitigation: keep the client's frame-handling identical, change only the socket URL.
- **20-min deadline** with LLM players → cap turns + concurrent waves; cert stays short.
- **No memory tool** on the reference player yet (player-policy guidance prefers `remember()`); v1
  ships the existing oriented LLM agent and notes memory as the first optimizer-driven improvement.
- **Reporters/graders/optimizer** deferred; the design leaves clean seams (the replay frames are a
  ready full-resolution transcript + god's-eye source).
