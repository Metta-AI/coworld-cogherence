/**
 * The Cogherence coworld game-host: a thin wrapper over @cogweb/coworld's
 * `runCoworldHost`. The shared host owns the `/player` bridge (one external
 * `RemotePlayerPilot` per seat), the spectator/replay feeds, artifact IO, and the
 * lifecycle; this file supplies the episode wording wrapper, results, `welcome`
 * config, and console. Wording does not alter the engine's fixed `MAX_TURNS` horizon.
 */
import { runCoworldHost, runCoworldReplay as runReplayHost, findConsoleDir } from "@cogweb/coworld";
import type { CoworldClient, CoworldHostHandle, ReplayServerHandle } from "@cogweb/coworld";

import { moduleWithPromptSelection } from "../game/game.js";
import { resolvePromptSelection } from "../agents/llm/prompt-variants.js";
import type { CoghereSeamState, CoghereDecision } from "../game/game.js";
import { cogherenceResultsSchema, type CogherenceResults } from "./results.js";
import type { CoworldConfig } from "./config.js";

/** Wait this long for every external player to connect before starting anyway. */
const CONNECT_DEADLINE_MS = Number(process.env.COGHERENCE_CONNECT_DEADLINE_MS ?? 90_000);

const client = (): CoworldClient => ({
  distDir: findConsoleDir(import.meta.url),
  title: "Cogherence",
  playerIndexFile: "index-agent.html",
});

export interface CoworldGameOptions {
  host?: string;
  port?: number;
  config: CoworldConfig;
}

export type CoworldGameHandle = CoworldHostHandle<CogherenceResults>;

/** Boot the cogherence coworld game-host. */
export function runCoworldGame(opts: CoworldGameOptions): Promise<CoworldGameHandle> {
  const { config } = opts;
  const selection = resolvePromptSelection(config);
  return runCoworldHost<CoghereSeamState, CoghereDecision, CogherenceResults>({
    module: moduleWithPromptSelection(selection),
    tokens: config.tokens,
    playerNames: config.players.map((p) => p.name),
    seed: config.seed,
    host: opts.host,
    port: opts.port,
    connectDeadlineMs: CONNECT_DEADLINE_MS,
    welcomeConfig: () => ({ agents: config.tokens.length, seed: config.seed, players: config.players,
      promptVariant: selection.selection, promptSeed: selection.seed }),
    results: {
      schema: cogherenceResultsSchema,
      build: (scores) => cogherenceResultsSchema.parse({ scores }),
    },
    client: client(),
  });
}

/** Serve a recorded cogherence episode (the platform's replay-render check). */
export function runCoworldReplay(opts: {
  loadReplayUri: string;
  host?: string;
  port?: number;
}): Promise<ReplayServerHandle> {
  return runReplayHost({ ...opts, client: client() });
}
