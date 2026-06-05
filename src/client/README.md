# Cogherence Replay Client

A vite + React spectator client that renders a recorded Cogherence game as an SVG hex lattice you can scrub turn-by-turn. Phase 1 of the [follow-ons design](../../docs/plans/2026-06-05-cogherence-followons-design.md); built per [the phase-1 plan](../../docs/plans/2026-06-05-cogherence-replay-client.md).

## Run it

```bash
npm run dev        # regenerates public/replay.json, then serves the viewer at http://localhost:5173
npm run build:web  # production bundle -> dist/
npm run smoke      # playwright: build + preview + assert the lattice renders and scrubs
```

`npm run dev` / `npm run smoke` regenerate `public/replay.json` first (via the `predev` / `presmoke` hooks). To record a specific game by hand:

```bash
npm run play -- --seed 42 --agents greedy,peaceful,random,greedy --out public/replay.json
```

The viewer `fetch`es `./replay.json` at startup.

## How it works

The engine records a game as a `ServerMessage[]` stream — the **same** discriminated union (`src/shared/protocol.ts`) the phase-3 live server will broadcast over websockets. A replay is just `{ meta, frames }` of those messages, with full-state `snapshot` frames (every tile + cog), so a recorded game and a live game render identically.

| Module | Responsibility |
|---|---|
| `replay-source.ts` | Validate a replay (zod, fail-loud) and project it to an ordered `GameSnapshot[]` |
| `hex-layout.ts` | Pure axial→pixel geometry for pointy-top hexes |
| `colors.ts` | Stable per-cog color palette + display names (Alice, Bob, …) by index |
| `HexBoard.tsx` | SVG lattice: one polygon per tile, fill = cog color, opacity = coherence |
| `Scrubber.tsx` | Play / pause / step / slider over the snapshot list |
| `Hud.tsx` | Turn + commons readout; per-cog hearts / energy (by name) |
| `Roster.tsx` | The players panel: color swatch + name + territory (tiles held) per Cog |
| `App.tsx` | Loads the replay (or an injected one for tests) and wires it together |

## Phase 3 swap

When the live server lands, `App` swaps its `fetch`-a-replay step for a `WorldSocket` that pushes the same `ServerMessage` frames over `ws` — the snapshot renderer doesn't change. Per-cog HUD views will feed `HexBoard` a redacted snapshot (fog of war).
