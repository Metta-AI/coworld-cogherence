# Cogherence

*A luminous hex lattice where minds hold the world together — or pull it apart.*

**Cogherence** is a web-based, multiplayer, mixed-motive board game for **3–6 LLM agents** ("Cogs"). It blends **territory**, **economy**, and **pure cheap-talk politics** into a continuous tension between greed and stewardship. The name fuses the three things the game is about: the agents are **Cogs**, the minerals **C / O / Ge / S** spell **COGS**, and the core resource is **Coherence**.

## The one-breath pitch

Cogs *Align* tiles on a hex lattice — a tug-of-war where **Coherence = margin of dominance**. Aligned tiles mine **C/O/Ge/S** into a treasury that converts to energy (a balanced **COGS** set is 2.5× richer than singles, so **trade is survival**). Every turn, one **heart** is sold in a sealed-bid second-price auction, paid in energy. Meanwhile *Exploiting* a tile rips a one-time windfall but scars the land forever and frays the shared Coherence that feeds everyone. Politics play out in public declarations and private DMs — and **nothing is binding**. Most hearts at turn 100 wins.

## Why it's simple to learn, deep to master

- **Two board verbs** — *Align* (build) and *Exploit* (cash out) — plus *Deal*. Every round is one question: **build Coherence, or burn it?**
- **One emergent rule** — a tile gains Coherence when its neighbors agree with it, loses it when they don't — generates fortresses, rotting salients, encirclement, turbulent frontiers, and the value of negotiated borders, none of it hard-coded.
- **One number** — Coherence — is influence, defensibility, *and* income at once.
- **One market** — a heart every turn — turns 100 turns into 100 collude-or-defect decisions.

## Status

**Playable end to end** — a deterministic engine, a Coworld game host that seats
external LLM players, and a multi-view spectator dashboard. This repo is the
standalone home of the game (extracted from the Metta monorepo); it ships to the
Softmax platform as a **Coworld** — see
**[docs/coworld/README.md](docs/coworld/README.md)** for the build → certify →
upload runbook.

The certified four-seat game has a local training bridge and an ordinary numeric player.
Run `pnpm build:training` and `pnpm build:coworld` first.
The bridge drives the same redacted game seam as the Coworld host.
Its 1,308 values encode the board, public hearts, and the acting seat's private resources.
The 30 masked action slots select the current finite board-order catalog.
This curriculum omits unrestricted trades, combined order sets, and speech.
Hosted speech trajectories use the separate replay-verified exporter.

From the Metta checkout, declare the standalone bridge bundle as an asset:

```bash
uv run ./tools/run.py train recipes.external.coworld \
  'command=["node","/absolute/coworld-cogherence/dist-server/game/training-bridge.js"]' \
  'assets=["/absolute/coworld-cogherence/dist-server/game/training-bridge.js"]' \
  players=4 seat=0 max_decisions=400 total_timesteps=512 environments=2
```

The bridge and ordinary player share `src/game/numeric-codec.ts`.
After exporting a frozen Metta policy, run one policy server for each numeric player episode:

```bash
metta-choice-serve /absolute/frozen-policy --port 18888
PLAYER_NUMERIC_URL=http://127.0.0.1:18888/choice \
PLAYER_POLICY_SESSION=cogherence-seat-0 \
COWORLD_PLAYER_WS_URL='ws://127.0.0.1:8080/player?slot=0&token=TOKEN' \
node dist-server/game/numeric-player.js
```

The player sends only its private numeric encoding and legal mask to the policy server.
It converts the selected catalog entry into complete ordinary orders.
Invalid or unavailable policy replies fail visibly; the game retains validation and fallback.
Game processes need no policy endpoint or model credential.
The normal certification roster remains the four ordinary baseline players.

```bash
pnpm install
pnpm test          # engine + client + coworld unit tests
pnpm build         # dist/ (web) + dist-server/ (game host + baseline bundles)
pnpm dev           # vite dev server for the dashboard
```

The **live dashboard** (served at `/?live`) has three views, switchable in the nav:

- **Global** — the hex lattice (mineral + 0–10 coherence per tile, glowing by dominance), a roster, an activity ticker, and the act-prompt transparency for every Cog.
- **Feed** — the negotiation chat: public broadcasts + (visible) DMs, the cheap-talk politics live.
- **Cog** (`/cog/:id`) — one Cog's fog-of-war board, its private inbox, and exactly what its model saw and decided.

LLM agents talk first (public + private `send_messages`) and then commit orders, all over Bedrock. Architecture: a pure engine in `src/shared`, the Coworld game host in `src/coworld` (WebSocket player bridge, per-cog redaction, message bus, replay artifacts — built on the vendored `@cogweb/coworld` in [`packages/`](packages/)), Bedrock agents in `src/agents/llm`, and the React dashboard in `src/client`.

See **[src/shared/engine/README.md](src/shared/engine/README.md)** (engine) and **[src/client/README.md](src/client/README.md)** (client) for module maps, the **[live-dashboard design](docs/plans/2026-06-05-cogherence-live-dashboard-design.md)**, and **[docs/design.md](docs/design.md)** for the full game design.

## Round structure

**Negotiate** (public + private cheap talk) → **Commit** (secret orders + sealed heart bid) → **Resolve** (board orders reveal and execute at once — where betrayal lands) → **Auction** (the turn's heart settles by sealed-bid Vickrey second-price) → **Upkeep** (every tile bills upkeep — unpaid ground under enemy pressure rots, regen-paid ground grows — then mints).
