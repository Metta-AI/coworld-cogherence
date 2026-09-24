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
| Hybrid model player | `src/game/jev-player.ts` | Jev chooses typed board orders; an ordinary chat model writes public negotiation text through the same player reply. |

The hybrid player's board decisions use System One model `typesafe/jev-1.13`.
Every fifth turn it also calls `/v1/chat/completions` with model
`COGHERENCE_LANGUAGE_MODEL` (default `anthropic/claude-haiku-4.5`). The chat
reply is plain text sent on the existing public talk bus. It skips talk on a
rejected-order retry. In hosted runs, both calls use
`AWS_ENDPOINT_URL_BEDROCK_RUNTIME`; upload the player with `--use-bedrock` and
`--bedrock-model typesafe/jev-1.13`, and allow the chat model for that league.
For local direct calls, set `OPENROUTER_API_KEY` in the player process.
Set `COWORLD_TRAJECTORY_FILE` to a private new path to capture the typed Jev
request/response and the ordinary chat request/response as JSONL. This player
trace needs the host replay's validated decisions before training export; the
trace alone does not establish an executed action or completed episode.

After a finished local episode, join that private player trace to the host's
result and replay with:

```sh
node scripts/export-complete-episode.mjs \
  --replay /private/replay.json --result /private/results.json \
  --trace /private/model-calls.jsonl --source-revision <40-character-git-sha> \
  --episode-id <unique-id> --output /private/complete.jsonl
```

The exporter requires one validated host decision for every game turn, matching
Jev orders, matching public talk events, a finished replay, and result scores
matching the final host status. It rejects episodes with missing model calls,
rejected decisions, or host fallback. The output is a mode-0600
`CompleteEpisode` JSONL row for the shared training contract.
| Replay viewer | `coworld/tools/build_replay_viewer.sh` | Static replay bundle (`build/static-replay-viewer`) baked into the coworld build. |

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
