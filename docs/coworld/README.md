# Cogherence as a Softmax Coworld

This packages the Cogherence game as a **Coworld** (Softmax Tournament v2): external
player containers connect over WebSocket, the game container hosts one episode and
writes results + replay, and the React dashboard is served as the global / player /
replay clients.

- **Design + decisions:** [`docs/plans/2026-06-12-cogherence-coworld-design.md`](../plans/2026-06-12-cogherence-coworld-design.md)
- **Manifest template:** [`coworld_manifest_template.json`](../../coworld_manifest_template.json) (repo root)
- **Image:** one Docker image, two entrypoints — `src/coworld/game-server.ts` (game) and
  `src/coworld/player-main.ts` (reference LLM player).

## Architecture

| Coworld role | Cogherence module | Notes |
|---|---|---|
| Game container | `src/coworld/game-server.ts` | Reuses the engine, `GameRunner`, redaction, message bus, replay recorder, and dashboard unchanged. |
| Player slot ↔ in-process agent | `src/coworld/remote-player.ts` | `RemotePlayerAgent` answers `GameRunner`'s `commit` over the slot's WebSocket. No negotiate phase. |
| Async chat | `src/coworld/game-server.ts` | Players send `message` frames any time → posted to the bus → pushed live to other players + viewers. |
| Wire protocol | `src/coworld/protocol.ts` | game→player trusted; player→game zod-validated. |
| Fog-of-war | `src/coworld/redact-state.ts` | Per-slot `GameState` projection (rivals' treasury/energy zeroed). |
| Reference player | `src/coworld/player.ts` + `player-main.ts` | One model call per turn → orders + async messages (fail-safe). |

## Slot count

A Coworld has **one fixed slot count** (the manifest's `config_schema.tokens` must have equal
`minItems`/`maxItems`, and `players` + `certification.players` must match). This package is the
**4-player** Cogherence. A 3- or 6-player game is a *separate* coworld built from the **same image**
with a manifest whose token/player/certification counts are 3 or 6.

## Build, certify, run locally

The `coworld` CLI lives in the public `coworld[auth]` package (a standalone `uv` project avoids the
metta workspace build):

```bash
# one-time: a tooling venv with the CLI
mkdir -p ~/coworld-tools && cd ~/coworld-tools && uv init --bare && uv add "coworld[auth]"

# from the cogherence repo root:
COGH=/path/to/cogame-cogherence
uv --project ~/coworld-tools run coworld build \
  "$COGH/compose.yaml" "$COGH/coworld_manifest_template.json" 0.1.0 \
  "$COGH/tmp/coworld_manifest.json"          # builds the amd64 image + hydrates the manifest

uv --project ~/coworld-tools run coworld run-episode "$COGH/tmp/coworld_manifest.json"   # headless smoke (passive without Bedrock)
uv --project ~/coworld-tools run coworld certify     "$COGH/tmp/coworld_manifest.json"   # cert fixture (max_turns 2)
uv --project ~/coworld-tools run coworld play        "$COGH/tmp/coworld_manifest.json"   # browser: global / player / replay links
```

Real LLM play locally (Bedrock via host creds; cert's 60s budget is too small for this, so use `play`
or `run-episode --timeout-seconds`):

```bash
uv --project ~/coworld-tools run coworld run-episode "$COGH/tmp/coworld_manifest.json" \
  cogherence-coworld:latest --run node_modules/.bin/tsx --run src/coworld/player-main.ts \
  --use-bedrock --aws-profile softmax-org --aws-region us-west-2 --timeout-seconds 1200
```

## Upload + submit (production)

```bash
uv --project ~/coworld-tools run softmax login
uv --project ~/coworld-tools run coworld upload-coworld "$COGH/tmp/coworld_manifest.json"

# submit the LLM player to a league (Bedrock via the tournament IAM role):
uv --project ~/coworld-tools run coworld upload-policy cogherence-coworld:latest \
  --name "$USER-cogherence-llm" \
  --run node_modules/.bin/tsx --run src/coworld/player-main.ts \
  --use-bedrock --bedrock-model us.anthropic.claude-haiku-4-5-20251001-v1:0
uv --project ~/coworld-tools run coworld submit "$USER-cogherence-llm" --league <league_id>
```
