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

A full four-seat episode makes 800 language calls before retries. At 30 calls
per minute, it cannot finish within a 15-minute hosted budget without an explicit
capacity configuration. Local deterministic parity tests do not establish model
strength or production capacity.

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
