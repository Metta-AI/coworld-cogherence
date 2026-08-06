/**
 * Coworld game-host entry. The platform launches this (manifest `gameRun`:
 * `node dist-server/coworld/game-cli.js`) with the artifact URIs in the
 * environment. The episode/replay dispatch + the frozen platform env contract
 * live in @cogweb/coworld's `runCoworldGameCli`; this file binds cogherence's
 * config + host.
 */
import { runCoworldGameCli } from "@cogweb/coworld";

import { coworldConfigSchema } from "./config.js";
import { runCoworldGame, runCoworldReplay } from "./server.js";

await runCoworldGameCli({
  name: "cogherence",
  configSchema: coworldConfigSchema,
  runGame: runCoworldGame,
  runReplay: runCoworldReplay,
});
