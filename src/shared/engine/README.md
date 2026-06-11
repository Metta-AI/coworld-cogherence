# Cogherence Engine

The headless, deterministic game engine for **Cogherence** — a mixed-motive hex-lattice game for LLM agents. Pure TypeScript, no I/O in the core: every function is a pure transition over a serializable `GameState`. Full design: [`docs/plans/2026-06-04-cogherence-engine.md`](../../../docs/plans/2026-06-04-cogherence-engine.md).

## Run it

```bash
npm install
npm run play                                              # default 4-agent game, seed 7
npm run play -- --seed 42 --agents greedy,greedy,peaceful,random
npm run play -- --seed 7 --out game.json                 # also write a replay (ServerMessage frames)
npm test            # full suite (engine + client)
npm run typecheck   # tsc --noEmit (strict)
```

Example output:
```
Cogherence — seed 7, agents [greedy, peaceful, random, greedy]
turn   1  cog0:0  cog1:0 cog2:0 cog3:0
turn 100  cog0:62 cog1:0 cog2:0 cog3:37
winner: cog0  final cog0:62 cog3:37 cog1:0 cog2:0
```

CLI flags: `--seed <n>` · `--agents greedy,peaceful,random,...` (overrides `--cogs`) · `--cogs <n>` · `--out <file.json>` · `--every <n>` (summary sampling interval).

## Module map

| Module | Responsibility |
|---|---|
| `constants.ts` | Tunable game numbers (all v1 defaults LOCKED in the plan) |
| `rng.ts` | Seeded mulberry32 PRNG — all randomness is reproducible |
| `hex.ts` | Axial hex coordinates: `key`, `neighbors`, `distance`, `hexesInRadius` |
| `types.ts` | Serializable core model: `GameState`, `Tile`, `CogState`, `Mineral`, … |
| `energy.ts` | COGS-set energy conversion (`maxEnergy`, monotonic `chargeEnergy`) |
| `board.ts` | Seeded board generation (`generateBoard`) |
| `coherence.ts` | `resolveTile` (the Align tug-of-war) |
| `orders.ts` | zod `OrderSchema` + legality (`isLegalAlignTarget`, `isOwn`) |
| `resolve.ts` | Resolve phase: budget → auction → charge → exploit → tug-of-war |
| `upkeep.ts` | Upkeep phase: per-tile bills (pay-or-rot, paid tiles heal free by allies) → mint |
| `game.ts` | `newGame` / `stepTurn` / `runGame` / `scoreGame` + the turn loop |
| `log.ts` | `TurnRecord` (events + hearts), for replay |
| `../../agents/` | `Agent` interface + stub policies (peaceful / greedy / random) |

## Core rules

- **Coherence = margin of dominance.** Coherence moves with the upkeep bill: a tile whose bill goes unpaid while under resistance (any enemy neighbor) loses 1 (neutral at 0) — zero-resistance ground holds. The bill is a base of floor(sqrt(tiles owned)) — empire scale taxes every tile — + resistance = 10e per enemy neighbor; allies never cheapen defense (neutral counts for nothing) but ARE the healing: a paid tile regenerates +1 coherence per allied neighbor every turn, free. An Align is a tug-of-war where the winner's new coherence = its force minus the runner-up's. Aligns commit FORCE (1-10); the engine bills force² + distance² from the aligner's closest tile (out of reach above 100e), full price charged win or lose — reach is quadratically expensive. Any in-board tile is a legal target. The k-th Align in one turn bills (k−1)×10e extra — overhead that buys no force.
- **Economy.** Aligned tiles mint `floor(density × coherence / 10)` minerals each Upkeep (deterministic; density is a 0-10 power-law float, displayed floored); a full **C + O + Ge + S** set converts to 10 energy vs 1 for a single, so balanced trade is efficient. Affordability is monotonic (`maxEnergy ≥ need`).
- **Hearts.** One heart is auctioned each turn (sealed second-price, paid in energy, 1-energy reserve; only cogs holding ground may bid; ties go to the first bidder by commit order). Most hearts at turn 100 wins.
- **Exploit.** Strip-mine an owned tile for a `floor(10 × coherence × density)` mineral windfall — but it goes neutral and its density permanently drops by coherence/10.
- **Abandon.** Return an owned tile to neutral and recover its coherence as energy (next-turn money, no scarring).

## Invariants

- **Deterministic**: `runGame(seed, n, agents)` is fully reproducible (all randomness flows through the seeded PRNG). Stateful agents (e.g. `randomAgent`) must be re-created per game.
- **Pure**: every phase returns a new `GameState`; inputs are never mutated.
- **Validated boundary**: agent orders are zod-validated; an illegal or unaffordable order set is rejected wholesale, never partially applied.

## Status & next

Engine MVP complete. The replay/spectator web client (phase 1) is built — see [`src/client/README.md`](../../client/README.md). Remaining follow-ons: LLM agents implementing the `Agent` interface, and a live server with the public/private negotiation channels. Plan: [`docs/plans/2026-06-05-cogherence-followons-design.md`](../../../docs/plans/2026-06-05-cogherence-followons-design.md).
