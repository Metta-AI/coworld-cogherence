# Cogherence Engine (MVP) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a seeded, deterministic, fully-tested headless game engine that plays a complete 100-turn game of Cogherence with scripted agents and emits a replayable log.

**Architecture:** A pure-functional core. `GameState` is a plain serializable object; each phase is a pure transition `(state, inputs) -> { state, events }`. No mutation of inputs, no I/O in the core. A thin CLI drives a game with stub agents and prints the log. Determinism comes from a seeded PRNG carried in state. UI, networking, and LLM agents are explicitly out of scope (follow-on plans).

**Tech Stack:** TypeScript (ESM, strict), vitest (TDD), zod (order validation), tsx (run), a tiny seeded PRNG (mulberry32, hand-written — no dep). Mirrors the `cogame-polis` toolchain.

---

## Scope & Non-Goals

**In scope (this plan):**
- Hex board model + seeded board generation.
- The Coherence engine: majority-neighbor drift + Align tug-of-war.
- Economy: minerals → treasury → energy (greedy COGS sets), upkeep.
- Exploit, Transfer, and the per-turn second-price heart auction.
- The four-phase round loop, 100-turn game, heart scoring, winner.
- Stub agents (Random / Greedy / Peaceful) for full-game tests.
- CLI runner + structured, replayable game log.

**Out of scope (follow-on plans):**
- Web client / rendering, websocket server, real LLM agents, persistence, partial observability / fog of war.

---

## Canonical Resolution Semantics (LOCKED for v1)

These are the exact rules the tasks implement. All magic numbers live in `src/engine/constants.ts` and are tunable later.

**Constants (v1 defaults):**
```
COHERENCE_MAX      = 6
BOARD_RADIUS       = 6     // 127 tiles
MAX_TURNS          = 100
UPKEEP_PER_TILE    = 1     // energy
SET_ENERGY         = 10    // 1×C+1×O+1×Ge+1×S -> 10 energy
SINGLE_ENERGY      = 1     // any single mineral -> 1 energy
EXPLOIT_MULT       = 2     // windfall = EXPLOIT_MULT × coherence × density
EXPLOIT_DENSITY    = 0.5   // density *= EXPLOIT_DENSITY (floored), min 0
TRANSFER_FEE       = 1     // energy per transfer order
```

**Energy (`chargeEnergy(treasury, need)`):** energy is derived on demand, never stored. To cover `need`: (1) while `need - granted >= SET_ENERGY` and a full COGS set exists, consume one of each mineral, `granted += 10`; (2) while `granted < need` and any mineral remains, consume one unit from the **largest** pile (preserves set-balance), `granted += 1`. Success iff `granted >= need`. No overshoot is possible for the sub-10 remainder. `maxEnergy(treasury) = sets*10 + leftoverSingles*1`.

**Resolve phase order (all orders are simultaneous; engine applies in this fixed order):**
1. **Validate & budget.** For each Cog, worst-case spend = `Σ align.energy + (#transfers × TRANSFER_FEE) + bid`. The minerals sent by transfers are reserved first; the remaining treasury must satisfy `chargeEnergy(remaining, worstCaseSpend)`. An over-budget or illegal order set is **rejected whole** (Cog does nothing that turn) and logged.
2. **Transfers.** Move minerals between treasuries (received minerals are usable next turn, not this turn). Charge `TRANSFER_FEE` energy each.
3. **Exploits.** For each Exploit on a tile the Cog owns: windfall `= EXPLOIT_MULT × coherence × density` of the tile's mineral → Cog treasury (using coherence **before** the drop); then `coherence = 0`, `alignment = null`, `density = floor(density × EXPLOIT_DENSITY)`. (Scorched earth happens *before* the scramble.)
4. **Align tug-of-war (per targeted tile).** For each tile that received Align orders, compute force per alignment `X`: `force(X) = (X === tile.alignment ? tile.coherence : 0) + Σ align.energy by X on this tile`. `winner = argmax force`. `newCoherence = min(COHERENCE_MAX, force(winner) − secondHighestForce)`. `alignment = winner`. **Tie for the max → tile becomes neutral at coherence 0.** Charge each Cog its committed Align energy.
5. **Auction.** Sealed-bid, second-price. Highest `bid` wins the turn's heart; **pays the second-highest bid** in energy (0 if sole bidder pays the reserve = 0). Ties for highest → deterministic tiebreak by Cog turn-order index. Losers pay nothing. `cog.hearts += 1` for the winner.

**Upkeep phase order:**
1. **Coherence drift.** Each tile counts its in-board neighbors. If a **strict majority** of its neighbors share its alignment → `coherence = min(MAX, coherence+1)`; otherwise → `coherence = max(0, coherence−1)`. Neutral tiles do not drift. (Compute all deltas from a snapshot, then apply — no order dependence between tiles.)
2. **Upkeep cost.** Each Cog owes `UPKEEP_PER_TILE` energy per aligned tile. Fund tiles in **descending coherence** (heartland first); each tile the Cog cannot fund loses 1 coherence (frontier rots first). A tile dropping to 0 stays aligned (flips only via Align).
3. **Mint.** Each aligned tile adds `density × coherence` of its mineral to its Cog's treasury (using post-drift, post-upkeep coherence).

**End & scoring:** after `MAX_TURNS` upkeeps, the Cog with the most `hearts` wins. Tiebreak: higher `maxEnergy(treasury)`, then lower Cog index.

---

## Project Layout

```
src/
  engine/
    constants.ts        # tunable numbers
    rng.ts              # mulberry32 seeded PRNG
    hex.ts              # axial coords, neighbors, board shape
    types.ts            # GameState, Tile, CogState, Mineral, ...
    orders.ts           # zod schemas + Order types + legality checks
    board.ts            # seeded board generation
    energy.ts           # chargeEnergy / maxEnergy
    coherence.ts        # tug-of-war + neighbor drift
    resolve.ts          # Resolve phase pipeline
    upkeep.ts           # Upkeep phase pipeline
    game.ts             # round loop, turn counter, scoring
    log.ts              # event/turn-record types
  agents/
    types.ts            # Agent interface, AgentView
    stub.ts             # Random / Greedy / Peaceful agents
  cli.ts                # run a game, print the log
```
Tests are co-located: `src/engine/hex.test.ts`, etc. (vitest convention).

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/engine/constants.ts`, `src/index.ts`

**Step 1: Write `package.json`**
```json
{
  "name": "cogherence",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "play": "tsx src/cli.ts"
  },
  "dependencies": { "zod": "^3.23" },
  "devDependencies": {
    "@types/node": "^20",
    "tsx": "^4",
    "typescript": "^5.4",
    "vitest": "^1.6"
  }
}
```

**Step 2: Write `tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Step 3: Write `vitest.config.ts`**
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
```

**Step 4: Write `src/engine/constants.ts`** — all constants from the LOCKED section above as exported `const`s.

**Step 5: Write a trivial `src/index.ts`**
```ts
export const VERSION = "0.1.0";
```

**Step 6: Install & verify**

Run: `cd ~/code/cogame-cogherence && npm install && npm run typecheck && npm test`
Expected: typecheck passes; vitest reports "no test files found" (exit 0).

**Step 7: Commit**
```bash
git checkout -b feat/engine-mvp
git add -A && git commit -m "chore: scaffold cogherence engine (ts + vitest)"
```

---

## Task 2: Seeded PRNG

**Files:** Create `src/engine/rng.ts`, `src/engine/rng.test.ts`

**Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { makeRng } from "./rng";

describe("makeRng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(42), b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("returns floats in [0,1)", () => {
    const r = makeRng(1);
    for (let i = 0; i < 100; i++) { const x = r(); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
});
```
**Step 2:** Run `npm test -- rng` → FAIL (no `makeRng`).

**Step 3: Implement** (mulberry32)
```ts
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randInt = (rng: () => number, n: number) => Math.floor(rng() * n);
```
**Step 4:** Run `npm test -- rng` → PASS.
**Step 5:** `git add -A && git commit -m "feat: seeded mulberry32 PRNG"`

---

## Task 3: Hex coordinates & board shape

**Files:** Create `src/engine/hex.ts`, `src/engine/hex.test.ts`

Use **axial** coords `{q, r}`. Key = `` `${q},${r}` ``. 6 neighbor directions.

**Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { key, neighbors, hexesInRadius } from "./hex";

describe("hex", () => {
  it("keys a hex", () => expect(key({ q: 1, r: -2 })).toBe("1,-2"));
  it("has 6 neighbors", () => expect(neighbors({ q: 0, r: 0 })).toHaveLength(6));
  it("radius 0 = 1 tile, radius 1 = 7, radius 6 = 127", () => {
    expect(hexesInRadius(0)).toHaveLength(1);
    expect(hexesInRadius(1)).toHaveLength(7);
    expect(hexesInRadius(6)).toHaveLength(127);
  });
});
```
**Step 2:** Run → FAIL.

**Step 3: Implement**
```ts
export interface Hex { q: number; r: number; }
export const key = (h: Hex) => `${h.q},${h.r}`;
const DIRS: Hex[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];
export const neighbors = (h: Hex): Hex[] => DIRS.map(d => ({ q: h.q + d.q, r: h.r + d.r }));
export function hexesInRadius(radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++)
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++)
      out.push({ q, r });
  return out;
}
```
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: axial hex grid + board shape"`

---

## Task 4: Core types

**Files:** Create `src/engine/types.ts` (no test — types only; verified by typecheck and downstream tests).

```ts
import type { Hex } from "./hex";
export type Mineral = "C" | "O" | "Ge" | "S";
export const MINERALS: Mineral[] = ["C", "O", "Ge", "S"];
export type CogId = string;
export type HexKey = string;
export type Treasury = Record<Mineral, number>;

export interface Tile { hex: Hex; alignment: CogId | null; coherence: number; mineral: Mineral; density: number; }
export interface CogState { id: CogId; index: number; treasury: Treasury; hearts: number; }
export type Phase = "negotiate" | "commit" | "resolve" | "upkeep";

export interface GameState {
  turn: number;
  phase: Phase;
  seed: number;
  tiles: Record<HexKey, Tile>;
  cogs: Record<CogId, CogState>;
  cogOrder: CogId[];            // stable order for tiebreaks
  log: import("./log").TurnRecord[];
}
export const emptyTreasury = (): Treasury => ({ C: 0, O: 0, Ge: 0, S: 0 });
```
**Step: typecheck & commit** `"feat: core engine types"`

---

## Task 5: Energy economy (chargeEnergy / maxEnergy)

**Files:** Create `src/engine/energy.ts`, `src/engine/energy.test.ts`

**Step 1: Failing tests** (encode the LOCKED energy rules)
```ts
import { describe, it, expect } from "vitest";
import { maxEnergy, chargeEnergy } from "./energy";

const T = (C=0,O=0,Ge=0,S=0) => ({ C, O, Ge, S });

describe("maxEnergy", () => {
  it("one full set = 10", () => expect(maxEnergy(T(1,1,1,1))).toBe(10));
  it("set + 2 singles = 12", () => expect(maxEnergy(T(2,2,1,1))).toBe(12));
  it("only singles = 1 each", () => expect(maxEnergy(T(3,0,0,0))).toBe(3));
});
describe("chargeEnergy", () => {
  it("covers small need with singles, no set burned", () => {
    const r = chargeEnergy(T(1,1,1,1), 3);
    expect(r).not.toBeNull();
    expect(maxEnergy(r!)).toBe(7); // 4 minerals - 3 singles from largest piles
  });
  it("burns a set for need>=10", () => {
    const r = chargeEnergy(T(2,2,2,2), 10);
    expect(r).toEqual(T(1,1,1,1));
  });
  it("returns null when unaffordable", () => {
    expect(chargeEnergy(T(1,0,0,0), 5)).toBeNull();
  });
});
```
**Step 2:** Run → FAIL.

**Step 3: Implement**
```ts
import type { Treasury, Mineral } from "./types";
import { MINERALS } from "./types";
import { SET_ENERGY } from "./constants";

const fullSets = (t: Treasury) => Math.min(...MINERALS.map(m => t[m]));
export function maxEnergy(t: Treasury): number {
  const sets = fullSets(t);
  const leftover = MINERALS.reduce((s, m) => s + (t[m] - sets), 0);
  return sets * SET_ENERGY + leftover;
}
export function chargeEnergy(t: Treasury, need: number): Treasury | null {
  const out: Treasury = { ...t };
  let granted = 0;
  while (need - granted >= SET_ENERGY && fullSets(out) > 0) {
    for (const m of MINERALS) out[m] -= 1;
    granted += SET_ENERGY;
  }
  while (granted < need) {
    const m = MINERALS.reduce((a, b) => (out[a] >= out[b] ? a : b)) as Mineral;
    if (out[m] <= 0) return null;
    out[m] -= 1; granted += 1;
  }
  return out;
}
```
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: COGS-set energy economy"`

---

## Task 6: Board generation (seeded)

**Files:** Create `src/engine/board.ts`, `src/engine/board.test.ts`

Generate radius-6 tiles; assign each a random mineral + density (e.g. density 1–3). Place `n` Cog home tiles spread around the ring; **seed minerals so each home cluster is missing ≥1 mineral type** (forces trade). For MVP keep it simple and assert invariants rather than perfect balance.

**Step 1: Failing tests**
```ts
import { describe, it, expect } from "vitest";
import { generateBoard } from "./board";

describe("generateBoard", () => {
  it("is deterministic for a seed", () =>
    expect(generateBoard(7, 4)).toEqual(generateBoard(7, 4)));
  it("creates 127 tiles for radius 6", () =>
    expect(Object.keys(generateBoard(7, 4).tiles)).toHaveLength(127));
  it("gives each of 4 cogs exactly one home tile", () => {
    const g = generateBoard(7, 4);
    const owned = Object.values(g.tiles).filter(t => t.alignment !== null);
    expect(owned).toHaveLength(4);
    expect(new Set(owned.map(t => t.alignment)).size).toBe(4);
  });
  it("home tiles start with positive coherence", () => {
    for (const t of Object.values(generateBoard(7, 4).tiles))
      if (t.alignment) expect(t.coherence).toBeGreaterThan(0);
  });
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement** `generateBoard(seed, numCogs): GameState` using `makeRng`, `hexesInRadius`, placing homes at evenly spaced ring hexes, mineral/density via rng, `cogOrder` = `["cog0".."cogN"]`, `turn=1`, `phase="negotiate"`, `log=[]`. (Full code written during implementation.)
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: seeded board generation"`

---

## Task 7: Coherence — neighbor drift

**Files:** Create `src/engine/coherence.ts`, `src/engine/coherence.test.ts`

**Step 1: Failing tests** (the emergent rule — the heart of the game)
```ts
import { describe, it, expect } from "vitest";
import { applyDrift } from "./coherence";
// helpers build a small GameState with hand-placed tiles...

describe("applyDrift", () => {
  it("interior tile (all friendly neighbors) gains coherence, capped at MAX", () => {/* + assert +1 */});
  it("isolated salient (minority friendly) loses coherence", () => {/* assert -1 */});
  it("neutral tiles never drift", () => {/* assert unchanged */});
  it("computes from a snapshot (no order dependence)", () => {/* two adjacent flips resolve symmetrically */});
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement** `applyDrift(state): GameState` — snapshot alignments, for each aligned tile count same-alignment in-board neighbors; strict majority (> neighborsInBoard/2) → +1 else −1; clamp `[0, COHERENCE_MAX]`; return new state.
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: majority-neighbor coherence drift"`

---

## Task 8: Coherence — Align tug-of-war

**Files:** Modify `src/engine/coherence.ts`; add `src/engine/coherence.tugofwar.test.ts`

**Step 1: Failing tests** (encode every LOCKED example)
```ts
import { describe, it, expect } from "vitest";
import { resolveTile } from "./coherence";

describe("resolveTile", () => {
  it("A 5 vs B 3 on neutral -> A at 2", () =>
    expect(resolveTile(null, 0, [["A",5],["B",3]])).toEqual({ alignment: "A", coherence: 2 }));
  it("incumbent A coh4, B attacks 3, A silent -> A at 1", () =>
    expect(resolveTile("A", 4, [["B",3]])).toEqual({ alignment: "A", coherence: 1 }));
  it("incumbent A coh4, B attacks 5 -> flips to B at 1", () =>
    expect(resolveTile("A", 4, [["B",5]])).toEqual({ alignment: "B", coherence: 1 }));
  it("reinforce own tile adds, capped at MAX", () =>
    expect(resolveTile("A", 5, [["A",4]])).toEqual({ alignment: "A", coherence: 6 }));
  it("tie -> neutral 0", () =>
    expect(resolveTile(null, 0, [["A",3],["B",3]])).toEqual({ alignment: null, coherence: 0 }));
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement** `resolveTile(incumbent, incumbentCoherence, aligns)` per LOCKED §4: build force map (incumbent gets +coherence), sum per alignment, find top two; tie → `{alignment:null, coherence:0}`; else `{winner, min(MAX, top−second)}`.
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: align tug-of-war resolution"`

---

## Task 9: Orders + zod schemas + legality

**Files:** Create `src/engine/orders.ts`, `src/engine/orders.test.ts`

**Step 1: Failing tests**
```ts
import { describe, it, expect } from "vitest";
import { OrderSchema, isLegalAlignTarget } from "./orders";

describe("orders", () => {
  it("parses a valid align order", () =>
    expect(OrderSchema.parse({ type:"align", tile:"0,0", energy:3 }).type).toBe("align"));
  it("rejects negative energy", () =>
    expect(() => OrderSchema.parse({ type:"align", tile:"0,0", energy:-1 })).toThrow());
  it("align target must be in/adjacent to the cog's territory", () => {/* build state, assert true/false */});
});
```
**Step 2:** Run → FAIL.
**Step 3: Implement** zod `OrderSchema` union (`align{tile,energy}`, `exploit{tile}`, `transfer{to,mineral,amount}`, `bid{energy}`), `Order` type, and helpers: `isLegalAlignTarget(state, cog, tile)` (tile is owned by cog OR neighbors an owned tile), `isOwn(state, cog, tile)` for exploit.
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: order schemas + legality checks"`

---

## Task 10: Resolve pipeline

**Files:** Create `src/engine/resolve.ts`, `src/engine/resolve.test.ts`

Implements LOCKED Resolve order: validate/budget → transfers → exploits → align tug-of-war → auction. Input: `state` + `Record<CogId, Order[]>`. Output: `{ state, events }`.

**Step 1: Failing tests** (one per stage + integration)
```ts
// - over-budget order set is rejected wholesale (cog unchanged, event logged)
// - transfer moves minerals, costs 1 energy, usable next turn only
// - exploit: windfall = 2*coh*density (pre-drop), tile -> neutral/0, density halved
// - exploit-before-align: exploited tile is neutral 0 when aligns resolve
// - auction: second-price; sole bidder pays 0; tie -> lower cog index wins
// - integration: a hand-built turn produces the expected end state
```
**Step 2:** Run → FAIL.
**Step 3: Implement** the pipeline as pure helpers (`budget`, `applyTransfers`, `applyExploits`, `applyAligns`, `runAuction`), each charging energy via `chargeEnergy`, each emitting events. Compose in `resolve(state, orders)`.
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: resolve phase pipeline"`

---

## Task 11: Upkeep pipeline

**Files:** Create `src/engine/upkeep.ts`, `src/engine/upkeep.test.ts`

Implements LOCKED Upkeep order: drift → upkeep cost (descending-coherence funding, unfunded −1) → mint.

**Step 1: Failing tests**
```ts
// - drift applied (reuses applyDrift)
// - cog that cannot pay upkeep: frontier (lowest-coherence) tiles lose coherence first
// - mint adds density*coherence of each tile's mineral to its owner
// - integration: snapshot in -> snapshot out
```
**Step 2:** Run → FAIL.
**Step 3: Implement** `upkeep(state): { state, events }`.
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: upkeep phase pipeline"`

---

## Task 12: Game loop, scoring, log types

**Files:** Create `src/engine/log.ts`, `src/engine/game.ts`, `src/engine/game.test.ts`

**Step 1: Failing tests**
```ts
// - newGame(seed, n) starts at turn 1, n cogs, 127 tiles
// - stepTurn(state, ordersByeCog) advances turn and appends a TurnRecord
// - runGame(seed, n, agents) ends after MAX_TURNS and returns a winner
// - winner = most hearts; tiebreak by maxEnergy then index
// - full game is deterministic for (seed, agents)
```
**Step 2:** Run → FAIL.
**Step 3: Implement** `TurnRecord` (orders, events, per-cog hearts/treasury, commons = Σ coherence), `newGame`, `stepTurn` (resolve → upkeep → bump turn, append record), `runGame(seed, n, agents)` looping to MAX_TURNS, `scoreGame(state)`.
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: game loop + scoring + log"`

---

## Task 13: Agent interface + stub agents

**Files:** Create `src/agents/types.ts`, `src/agents/stub.ts`, `src/agents/stub.test.ts`

**Step 1: Failing tests**
```ts
// - RandomAgent only emits legal orders it can afford
// - GreedyAgent expands toward weakest adjacent tile + exploits a frontier under threat
// - PeacefulAgent reinforces its lowest-coherence owned tiles
// - a 4-stub game completes 100 turns without throwing and yields a winner
```
**Step 2:** Run → FAIL.
**Step 3: Implement** `interface Agent { id; commit(view: AgentView): Order[] }` (negotiate is a no-op stub for MVP), `AgentView` = full state + `me` (later restricted), and the three stub policies. The 4-stub integration test is your first chance to *feel* the emergent dynamics.
**Step 4:** Run → PASS.
**Step 5:** Commit `"feat: agent interface + stub policies"`

---

## Task 14: CLI runner

**Files:** Create `src/cli.ts`; add `src/cli.test.ts` (smoke)

**Step 1: Failing test** — import the runner used by the CLI and assert a seeded 4-agent game returns a record with 100 turns and a winner.
**Step 2:** Run → FAIL.
**Step 3: Implement** `src/cli.ts`: parse `--seed`, `--cogs`, `--agents`, run `runGame`, print a compact per-turn summary (turn, commons, per-cog hearts) and the final winner; write full log to `--out game.json` if given.
**Step 4:** Run `npm run play -- --seed 7 --cogs 4` → prints a full game; `npm test` all green.
**Step 5:** Commit `"feat: cli game runner"`

---

## Task 15: Engine README + invariants doc

**Files:** Create `src/engine/README.md`; update root `README.md` status line.

Document the LOCKED semantics (link to this plan), the module map, and how to run a game. Commit `"docs: engine readme"`. Then open a PR from `feat/engine-mvp`.

---

## Milestones

- **M1 (Tasks 1–5):** Scaffold + primitives (rng, hex, types, energy).
- **M2 (Tasks 6–8):** The board + the Coherence engine — *the riskiest, most important core.* After Task 8 you can unit-prove every tug-of-war/drift example by hand.
- **M3 (Tasks 9–12):** Orders, the two phase pipelines, the game loop — a playable engine.
- **M4 (Tasks 13–15):** Stub agents, CLI, docs — a full game you can run and *feel*.

## Follow-on plans (not this plan)

1. **Replay & spectator client** — vite + React hex renderer reading the game log (Coherence glow, alignment color, the reveal animation).
2. **Live server** — express + ws, the Negotiate phase with real public/private channels.
3. **LLM agents** — implement `Agent` against Bedrock (mirror polis), serialize `AgentView` to a prompt, parse orders back through `OrderSchema`.
