// The Coworld reference PLAYER runnable: a short-lived container that connects to
// the game's /player WebSocket (COWORLD_PLAYER_WS_URL), acts in one slot for one
// episode via the existing Cogherence LLM agent, then exits. Decision logic lives
// in player.ts (testable); this file is just the socket wiring.
//
// Bedrock creds are never baked in: locally pass `coworld ... --use-bedrock`; in a
// league use `coworld upload-policy --use-bedrock --bedrock-model`. With no creds
// the LLM agent is fail-safe (converse throws → caught → no orders, bid 0), so the
// player plays passively and the episode still completes.
import WebSocket from "ws";
import type { GameToPlayer } from "./protocol";
import { reply, makeClient } from "./player";

async function main(): Promise<void> {
  const url = process.env.COWORLD_PLAYER_WS_URL;
  if (!url) throw new Error("COWORLD_PLAYER_WS_URL is required");
  const persona = process.env.COGHERENCE_PERSONA?.trim() || undefined;
  const client = makeClient();
  const ws = new WebSocket(url);

  ws.on("open", () => console.log(`connected to ${url}`));
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString()) as GameToPlayer;
    if (msg.type === "hello") {
      console.log(`playing slot ${msg.slot} as ${msg.you} (${msg.name})`);
      return;
    }
    if (msg.type === "final") {
      console.log("episode over, exiting");
      ws.close();
      return;
    }
    // A late reply (after the game's deadline) is dropped by the game keyed on
    // (phase, turn), so overlapping turns are safe.
    void reply(msg, client, persona).then((out) => {
      if (out && ws.readyState === ws.OPEN) ws.send(JSON.stringify(out));
    });
  });
  ws.on("close", () => process.exit(0));
}

void main();
