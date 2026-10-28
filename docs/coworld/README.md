# Cogherence as a Softmax Coworld

This packages the Cogherence game as a **Coworld** (Softmax Tournament v2): external
player containers connect over WebSocket, the game container hosts one episode and
writes results + replay, and the React dashboard is served as the global / player /
replay clients.

- **Design + decisions:** [`docs/plans/2026-06-12-cogherence-coworld-design.md`](../plans/2026-06-12-cogherence-coworld-design.md)
- **Manifest template:** [`coworld/coworld_manifest_template.json`](../../coworld/coworld_manifest_template.json) —
  **generated**, don't hand-edit: `npm run emit-manifest` regenerates it from
  `buildCogherenceManifest()` in [`src/game/coworld.ts`](../../src/game/coworld.ts).
- **Image:** one Docker image (root [`Dockerfile`](../../Dockerfile)), two entrypoints —
  `dist-server/coworld/game-cli.js` (game host) and `dist-server/game/baseline-player.js`
  (deterministic baseline player used for certification).

## Architecture

| Coworld role | Cogherence module | Notes |
|---|---|---|
| Game container | `src/coworld/game-cli.ts` → `src/coworld/server.ts` | Thin wrapper over `@cogweb/coworld`'s `runCoworldHost` / `runCoworldGameCli`; supplies the `cogherenceModule` seam, results schema, and console. |
| Episode config | `src/coworld/config.ts` | Zod schema for the manifest `game_config` (tokens, players, seed, num_agents). |
| Results | `src/coworld/results.ts` | Results schema written at episode end. |
| Baseline player | `src/game/baseline-player.ts` | Deterministic no-LLM baseline: always-legal holds, so it certifies the contract offline. |
| Replay viewer | `coworld/tools/build_replay_viewer.sh` | Static replay bundle (`build/static-replay-viewer`) baked into the coworld build. |

## Native language training

`pnpm build:training` bundles `dist-server/game/training-bridge.js`. Run it over
JSONL stdin/stdout using the shared Metta `GameBridge` reset/step/teacher protocol.
Each seat has a grouped JSON talk target followed by an orders target. Both use
`inference_mode: text_action`, the production renderer, and the production parser.
Posts retain public/private recipients. Speech is buffered until the player reply,
so orders see the same inbox as the concurrent native player call.

Set `COGHERENCE_SEAT_NAMES_JSON` to a JSON array of the four dispatched roster
names, in seat order, when replaying or training against a hosted scenario. The
public training bridge preserves those labels in private views and prompts.
Omitting it retains the historical `Cog 1` through `Cog 4` defaults. The complete
native-loop system test checks a custom roster through the actual subprocess
reset/step protocol, including every negotiation/orders request and retry.

The orders renderer includes the entire public board: coordinates, owner,
coherence, mineral and density. These are already present in the native redacted
view; other players' private treasuries and energy remain redacted. The earlier
own-tile-only summary hid public expansion/trade information from the language
player. The JSON contract also lists `abandons` at the top level, matching the
existing parser. It was previously misplaced inside `exploits`. These corrections
change the native prompt profile, not the engine or its 100-turn horizon. Preserve
older captures as their original source version; collect and qualify fresh model
data before claiming the corrected profile ready.

`pnpm build:coworld` also bundles `dist-server/game/llm-player.js`. Configure it
with `COWORLD_LLM_ENDPOINT` and `COWORLD_LLM_MODEL`; it uses native chat completions.
The game writes complete private trajectories to `COGAME_SAVE_TRAJECTORY_URI`.
Exact requests, sampled responses, actual platform call IDs, rejected attempts,
and applied actions stay in this artifact. Public replay omits private prompts,
model responses, and private direct messages.

The coordinator supplies `COWORLD_EPISODE_ID`, `COWORLD_GAME_VERSION`,
`COWORLD_SOURCE_REVISION`, and `COWORLD_GAME_IMAGE_DIGEST`. Missing pins remain
unavailable; shared strict training qualification rejects unpinned episodes.
Use the shared Coworld training qualifier/exporter on the private complete
trajectory. No public replay reconstruction supplies training labels.

The separately bundled `pnpm build:numeric` interface is an encoded numeric
candidate policy interface. It is not ordinary language prompt parity.

A full four-seat episode makes 800 language calls before retries. The manifest
sets a 90-minute hosted wall-clock limit so the native serial seat loop can
complete all 100 turns with real inference. This changes the platform deadline;
the engine's horizon, player behavior and pacing stay the same. Measure actual
call latency, retries and completion rather than assuming a fast mock provider
represents hosted runtime. The sidecar's source default is 30 requests per minute
per effective player slot; deployed capacity remains an operational measurement.
Local deterministic parity tests do not establish model strength or capacity.

A deadline-only release can retain the certified immutable game/player image:
use the supported `coworld upload-coworld --from-coworld <id> --patch
'{"episode_timeout_minutes":90}' --version <new-version>` path and wait for hosted
certification. Keep the image's original runtime source identity and record the
manifest-change source separately. Rebuild the image for runtime code changes.

## Episode wording

`promptVariant` selects `canonical`, `plain`, `numbered`, `questions`, or
`reordered`. `mixed` selects one of those five using an explicit nonnegative
`promptSeed`. `heldout-briefing` and `heldout-reference` are evaluation-only;
training-bridge resets reject them unless an evaluation split is supplied.
The v3 bank gives each alternate presentation independent board, mineral economy,
and upkeep explanations. Both held-out presentations have their own paraphrases.
Action syntax, costs, strategic guidance, and operator instructions remain fixed. Canonical retains
the existing corrections described below.

The host sends the fixed selection in the welcome config. Both negotiation and
orders use it, including retries; game randomness and engine state are untouched.
Private native observations retain `prompt_selection`, and attempts retain their
actual messages and serving evidence. Public views omit the selection. The
training bridge records `semantic_view.prompt_template` with selection fields and
SHA256 hashes of the exact system/user messages, including any retry instruction.
Metadata is not inserted into model messages.

The prior canonical prompt described retired live-server behavior. Its corrections
below intentionally change the text. Compare engine observations, decisions,
replays, and scores against the original numeric path; compare all new wordings
against the corrected canonical text. Neither comparison proves learned robustness.

The full language workflow covers two game seeds across all seven direct wordings
and one mixed selection per seed: 16 complete 100-turn episodes. Each runs both talk and
orders, one real parser rejection/retry, private direct messages, and energy-backed
bids. It compares private views, exact prompt hashes, actions, and final scores.
Optional numeric bundle arguments compare two complete original/current games,
including all 1,308 values and 30 candidate slots at every decision:

```sh
pnpm build:training
pnpm build:numeric
python3 scripts/test_prompt_games.py dist-server/game/training-bridge.js \
  /absolute/original/dist-server/game/numeric-bridge.js dist-server/game/numeric-bridge.js
```

The existing production-loop test uses the real host, four players, and a local
HTTP provider. It checks captured attempts, a rejected response and retry,
bridge/native message parity, private recipients, and public replay redaction.
Keep this production check alongside the complete-game wording workflow.
Neither test measures learned play quality.

## Rules described to players

The published host uses `cogherenceGame` and the pure engine's `stepTurn`.
It does not use the retired live server's conversion buttons, automatic set
conversion, commit-order auction ties, or first-commit energy bonus. Orders cannot
convert minerals. Auction ties follow the fixed Cog order. The platform reports
hearts as scores; the separate engine wealth-ranking helper does not change them.

The player rules now describe that existing behavior. They also remove conflicting
claims that neighbor resistance costs energy or that rejected unaffordable orders
are charged. Neighbor pressure changes coherence; valid affordable orders pay
costs, while rejected sets do not execute. These wording corrections leave the
engine, resource budgets, scoring, and 100-turn horizon unchanged.

## Slot count

A Coworld has **one fixed slot count** (the manifest's `config_schema.tokens` must have equal
`minItems`/`maxItems`, and `players` + `certification.players` must match). This package is the
**4-player** Cogherence. A 3- or 6-player game is a *separate* coworld built from the **same image**
with a manifest whose token/player/certification counts are 3 or 6.

## Build, certify, run locally

The `coworld` CLI lives in the public [Metta-AI/coworld](https://github.com/Metta-AI/coworld)
repo (a standalone `uv` project). Clone it once, then from **this repo's root**:

```bash
COWORLD=~/code/coworld           # a checkout of Metta-AI/coworld

pnpm install
pnpm build                       # dist/ (web) + dist-server/ (game + baseline bundles)
uv run --project "$COWORLD" coworld build --project coworld --version <x.y.z>

MANIFEST=coworld/dist/coworld_manifest.json
uv run --project "$COWORLD" coworld run-episode "$MANIFEST"
uv run --project "$COWORLD" coworld certify "$MANIFEST"
uv run --project "$COWORLD" coworld play "$MANIFEST"
```

`coworld build` builds the Docker image via [`coworld/compose.yaml`](../../coworld/compose.yaml)
(context = repo root, root `Dockerfile`), bakes the static replay viewer, and stamps the
manifest template with the image + version.

## Upload + submit (production)

```bash
uv run --project "$COWORLD" softmax login
uv run --project "$COWORLD" coworld upload-coworld "$MANIFEST"
```

Players are separate uploads (`coworld upload-policy … && coworld submit …`) — see the
league's own tooling; the certification baseline above is the only player shipped with
the game image.
