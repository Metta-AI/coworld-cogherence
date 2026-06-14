// The Coworld reference PLAYER runnable: a short-lived container that connects to
// the game's /player WebSocket (COWORLD_PLAYER_WS_URL), plays one slot for one
// episode via the existing Cogherence LLM agent, then exits. There is no
// negotiate phase: on each `commit` it fires TWO focused, concurrent model calls
// — orders (robust, with greedy fallback) and chat — sending each result
// independently so orders meet the commit deadline while chat flows async.
//
// Bedrock creds are never baked in: locally pass `coworld ... --use-bedrock`; in
// a league use `coworld upload-policy --use-bedrock --bedrock-model`. With no
// creds the orders call falls back to a scripted greedy move (and chat goes
// silent), so the player still plays and the episode completes.
import WebSocket from "ws";
import type { GameToPlayer, PlayerToGame } from "./protocol";
import { decideOrders, decideChat, makeClient } from "./player";

async function main(): Promise<void> {
  const url = process.env.COWORLD_PLAYER_WS_URL;
  if (!url) throw new Error("COWORLD_PLAYER_WS_URL is required");
  const persona = process.env.COGHERENCE_PERSONA?.trim() || undefined;
  const client = makeClient();
  const ws = new WebSocket(url);
  const send = (m: PlayerToGame): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
  };

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
    if (msg.type === "commit") {
      // Two concurrent calls; send each as it resolves. A late reply (after the
      // game's deadline) is dropped by the game keyed on turn, so this is safe.
      void decideOrders(msg.view, client, persona).then((orders) => send({ type: "commit_result", turn: msg.turn, orders }));
      void decideChat(msg.view, client, persona).then((posts) => posts.forEach((p) => send({ type: "message", to: p.to, text: p.text })));
    }
    // `message` pushes carry others' chat live; no reply needed.
  });
  ws.on("close", () => process.exit(0));
}

void main();
