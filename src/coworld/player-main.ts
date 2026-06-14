// The Coworld reference PLAYER runnable: a short-lived container that connects to
// the game's /player WebSocket (COWORLD_PLAYER_WS_URL), plays one slot for one
// episode via the existing Cogherence LLM agent, then exits. There is no
// negotiate phase: on each `commit` it makes one model call that submits orders
// and may send async chat; incoming `message` pushes carry others' chat live
// (and also appear in the next commit view). Decision logic lives in player.ts.
//
// Bedrock creds are never baked in: locally pass `coworld ... --use-bedrock`; in
// a league use `coworld upload-policy --use-bedrock --bedrock-model`. With no
// creds the model call is fail-safe (→ no orders/messages), so the player plays
// passively and the episode still completes.
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
    // `commit` → orders + async chat; `message` pushes produce no reply (the next
    // commit view carries the visible chat). A late commit reply (after the
    // game's deadline) is dropped by the game keyed on turn, so this is safe.
    void reply(msg, client, persona).then((frames) => {
      for (const f of frames) if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(f));
    });
  });
  ws.on("close", () => process.exit(0));
}

void main();
