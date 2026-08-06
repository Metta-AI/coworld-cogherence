// cogherence's coworld manifest, assembled with @cogweb/coworld's `buildManifest`.
//
// This replaces cogherence's hand-rolled `coworld_manifest_template*.json`: the
// config/results contracts and the runnables now live in code, validated against
// @cogweb/coworld's `CoworldManifest` zod schema at build time.
//
// The game runnable speaks the shared `cogweb.player.v1` protocol (see
// @cogweb/coworld's protocol.ts) — NOT cogherence's legacy `cogherence.player.v1`.
// The seam's `cogherenceGame` knobs are seed + playerCount (the engine supports
// 3–6 seats; MAX_TURNS is a fixed engine constant, not a per-episode knob). This
// coworld package is the fixed 4-seat Cogherence: `config_schema` pins `tokens`
// to 4 and carries the platform conventions (`players` names, `num_agents`) the
// ladder uses to size and label rounds.

import { buildManifest } from "@cogweb/coworld";
import type { CoworldManifest, JsonSchema, PlayerRunnable, Variant } from "@cogweb/coworld";

import { cogherenceGame } from "./game.js";

const GAME_IMAGE = "{{GAME_IMAGE}}";
const SOURCE_TREE = "https://github.com/Metta-AI/coworld-cogherence/tree/main";

// ── config / results JSON-Schema contracts ──────────────────────────────────
// Hand-authored draft-2020-12 schemas (the repo has no zod-to-json-schema dep).
// `config_schema` follows the platform's coworld contract and the LEAGUE.md
// conventions (the coguire/agricogla shape): this package is the FIXED 4-SEAT
// Cogherence coworld — the engine supports 3–6 seats, but a coworld has one
// fixed seat count (a 3- or 6-player game is a separate coworld built from the
// same image). The platform ladder infers the round's seat count from the
// variant game_config (`players` length / `num_agents`); a variable 3–6 `tokens`
// bound with neither would make seat inference fail and no round dispatch. The
// runner validates the per-episode game_config (with `tokens` injected) against
// this schema, so variants/certification omit `tokens` and the schema must
// accept exactly the keys they set. `results_schema` is the scores artifact:
// one Hearts score per seat plus an optional replay pointer.

const SEATS = 4;

const configSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["tokens", "players"],
  properties: {
    tokens: {
      type: "array",
      items: { type: "string", minLength: 1 },
      minItems: SEATS,
      maxItems: SEATS,
      description: "Per-seat auth tokens injected by the runner; length is the fixed seat count.",
    },
    seed: {
      type: "integer",
      description:
        "Optional deterministic episode seed. Omit it for a fresh random board per " +
        "episode (the league default); the certification fixture pins one for a " +
        "reproducible run.",
    },
    num_agents: {
      type: "integer",
      description:
        "Seat count for the episode. The platform ladder reads this from the " +
        "variant game_config to size a Competition round. Always the fixed seat count.",
    },
    players: {
      type: "array",
      minItems: SEATS,
      maxItems: SEATS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: { name: { type: "string", minLength: 1 } },
      },
      description:
        "Per-seat player display names (seat order). The platform injects the real " +
        "policy/player names here; the host labels each seat with them so replays and " +
        "the live roster show real names instead of the engine defaults.",
    },
  },
};

const resultsSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["scores"],
  properties: {
    scores: {
      type: "array",
      items: { type: "number" },
      description: "Final Hearts per seat, in seat order.",
    },
    replayUri: {
      type: "string",
      description: "Pointer to the saved replay artifact, if one was written.",
    },
  },
};

// ── runnables ───────────────────────────────────────────────────────────────

const players: PlayerRunnable[] = [
  {
    type: "player",
    id: "cogherence-baseline",
    name: "Cogherence Baseline",
    image: GAME_IMAGE,
    run: ["node", "dist-server/game/baseline-player.js"],
    source_url: SOURCE_TREE,
    description:
      "Deterministic no-LLM baseline: every turn it holds (no orders, no bid). Always-legal, so it certifies the contract offline.",
  },
];

// Placeholder seat names for offline configs (variants, the cert fixture); the
// platform overwrites `players[].name` with the seated policy/player names at
// dispatch.
const PLACEHOLDER_PLAYERS = Array.from({ length: SEATS }, (_, i) => ({
  name: `Cog ${String.fromCharCode(65 + i)}`,
}));

// One variant: the fixed four-seat game. Variants omit `tokens` (runner-injected).
// No pinned seed — the host mints a fresh random board per episode, so the league
// isn't replaying one memorized board forever. num_agents + the players roster are
// REQUIRED here: the platform ladder sizes a Competition round from the variant
// game_config (see configSchema notes).
const variants: Variant[] = [
  {
    id: "standard",
    name: "Standard (4 players)",
    description: "The four-seat game on a fresh random board each episode.",
    game_config: { players: PLACEHOLDER_PLAYERS, num_agents: SEATS },
  },
];

/** Assemble (and validate) cogherence's coworld manifest. */
export function buildCogherenceManifest(): CoworldManifest {
  return buildManifest({
    id: cogherenceGame.id,
    description:
      "A luminous hex-lattice, mixed-motive game for 3–6 LLM Cogs. Align tiles to mine C/O/Ge/S, convert " +
      "balanced COGS sets to energy, talk to rivals asynchronously (public + private cheap talk, nothing " +
      "binding), and win the single heart auctioned each turn by sealed second-price bid. Most hearts at the " +
      "final turn wins.",
    owner: "daveey@gmail.com",
    tags: ["board", "negotiation", "mixed-motive"],
    gameImage: GAME_IMAGE,
    gameRun: ["node", "dist-server/coworld/game-cli.js"],
    sourceUrl: SOURCE_TREE,
    replayViewerBundle: "build/static-replay-viewer",
    configSchema,
    resultsSchema,
    players,
    // No container commissioner: the Cogherence league runs on the platform
    // commissioner (typed `settings.ladder` + Temporal), so the manifest ships
    // no commissioner runnable — same shape as coworld-ctf.
    protocols: {
      // The platform requires both a `player` and a `global` (spectator)
      // protocol doc. The host speaks the shared @cogweb/coworld player wire
      // protocol and streams the @cogweb/core spectator `ServerMessage` feed
      // (the same frames the live console + replay viewer render); the replay
      // artifact is `{ protocol: "cogweb.replay.v1", frames }`.
      player: {
        type: "text",
        value:
          "Connect to the game's `/player?slot=&token=` route (the runner injects the URL as " +
          "COWORLD_PLAYER_WS_URL; a bad slot/token gets 401). Frames are JSON over the shared " +
          "@cogweb/coworld player protocol: on `welcome` record your slot + public config; on each " +
          "`observation` return a `reply` whose `decision` is `{ orders: [...] }` — an Order is one of " +
          "`{type:'align',tile,force}`, `{type:'exploit',tile}`, `{type:'abandon',tile}`, " +
          "`{type:'transfer',to,mineral,amount}`, `{type:'bid',energy}`; an empty list holds. The host " +
          "validates legality and, on rejection, re-requests with a `reason`. On `final` the episode is over.",
      },
      global: {
        type: "text",
        value:
          "Read-only spectator feed: the @cogweb/core ServerMessage stream the live console and replay " +
          "viewer render. Each turn advances commit → resolve → auction (sealed second-price) → upkeep, " +
          "emitting feed events (order, transfer, exploit, abandon, capture, auction, starved, lost, mint, " +
          "firstCommit) plus per-seat board snapshots; chat is async cheap-talk, not a phase. The saved " +
          'replay is `{ protocol: "cogweb.replay.v1", frames: ServerMessage[] }`. Spectators send nothing.',
      },
    },
    readme: { type: "uri", value: `${SOURCE_TREE}/README.md` },
    docs: [
      {
        id: "strategy.md",
        title: "Strategy",
        content: {
          type: "text",
          value:
            "- **Back your frontier.** A tile heals (+1/turn per allied neighbor) only if its upkeep is paid; " +
            "isolated salients rot. Expand in connected blobs, not thin spikes.\n" +
            "- **Balance the treasury.** Only full C+O+Ge+S sets convert efficiently; lopsided piles are dead " +
            "weight. Trade for what you lack — but deals are non-binding, so price in betrayal.\n" +
            "- **Win hearts cheaply.** The auction is second-price: bid your true value; you pay the runner-up's " +
            "price. Track rivals' likely energy.\n" +
            "- **Exploit is scorched earth.** A one-time windfall that permanently scars the tile and frays " +
            "shared coherence. Use it to deny or to cash out a losing position, not as your main engine.",
        },
      },
    ],
    variants,
    certification: {
      // Omits `tokens` (runner-injected); a pinned seed for a deterministic cert
      // run, placeholder seat names, and the fixed seat count.
      game_config: { seed: 7, players: PLACEHOLDER_PLAYERS, num_agents: SEATS },
      players: Array.from({ length: SEATS }, () => ({ player_id: "cogherence-baseline" })),
    },
    schemaUrl: "https://raw.githubusercontent.com/Metta-AI/coworld/main/src/coworld/coworld_manifest_schema.json",
  });
}

/** The assembled manifest object (validated on module load). */
export const cogherenceManifest: CoworldManifest = buildCogherenceManifest();
