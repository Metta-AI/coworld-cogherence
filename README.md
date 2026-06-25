# Cogherence

<!-- COWORLD-VERIFY-BADGE:START -->
![Coworld verify: not ready](https://img.shields.io/badge/coworld%20verify-not%20ready-lightgrey)
<!-- COWORLD-VERIFY-BADGE:END -->


<!-- COWORLD-REPO-STATUS:START -->
> [!NOTE]
> Coworld repo status: **template** (`coworld-template`).
> Canonical repository: `Metta-AI/coworld-cogherence`.
> Manifest path: `coworld_manifest_template.json`.
> Build path: `Dockerfile`
> Certification: blocked until this template resolves to a concrete `coworld_manifest.json` and `uv run coworld certify coworld_manifest.json` passes.
>
> Missing pieces:
> - [ ] Resolve `coworld_manifest_template.json` into a concrete root `coworld_manifest.json`.
> - [ ] Confirm buildable game and starter-player images.
> - [ ] Run `uv run coworld certify coworld_manifest.json` and record the passing command.
<!-- COWORLD-REPO-STATUS:END -->


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

**Playable end to end** — a deterministic engine, LLM-driven Cogs that negotiate and play live, and a multi-view spectator dashboard.

```bash
npm run serve:llm -- --agents llm,llm,greedy,greedy --turns 12 --pace 2000   # live LLM game
#   → open http://localhost:8080/?live

npm run play -- --seed 7 --out public/replay.json && npm run dev             # record + watch a replay
```

The **live dashboard** (served at `/?live`) has three views, switchable in the nav:

- **Global** — the hex lattice (mineral + 0–10 coherence per tile, glowing by dominance), a roster, an activity ticker, and the act-prompt transparency for every Cog.
- **Feed** — the negotiation chat: public broadcasts + (visible) DMs, the cheap-talk politics live.
- **Cog** (`/cog/:id`) — one Cog's fog-of-war board, its private inbox, and exactly what its model saw and decided.

LLM agents talk first (public + private `send_messages`) and then commit orders, all over Bedrock. Architecture: a pure engine in `src/shared`, an async live server in `src/server` (HTTP + ws, per-cog redaction, a message bus, an act-prompt hub), Bedrock agents in `src/agents/llm`, and the React dashboard in `src/client`.

See **[src/shared/engine/README.md](src/shared/engine/README.md)** (engine) and **[src/client/README.md](src/client/README.md)** (client) for module maps, the **[live-dashboard design](docs/plans/2026-06-05-cogherence-live-dashboard-design.md)**, and **[docs/design.md](docs/design.md)** for the full game design.

## Round structure

**Negotiate** (public + private cheap talk) → **Commit** (secret orders + sealed heart bid) → **Resolve** (board orders reveal and execute at once — where betrayal lands) → **Auction** (the turn's heart settles by sealed-bid Vickrey second-price) → **Upkeep** (every tile bills upkeep — unpaid ground under enemy pressure rots, regen-paid ground grows — then mints).
