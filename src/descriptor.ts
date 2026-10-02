/**
 * Reusable descriptor for Cogherence on the shared @cogweb/core platform.
 * `cogherenceDescriptor` is the unit the hub spins instances of: it carries the
 * pure module plus a `createWiring` factory
 * called ONCE PER INSTANCE, so every concurrent cogherence game gets its own
 * `MessageBus` and talk cursor instead of sharing one.
 *
 * LLM seats are driven by `LlmPilot` over native Messages; the cross-seat negotiation
 * substrate is a per-instance `MessageBus` fed from the live "talk" event stream
 * via `onServerMessage`. cogherence's turn decision is the simultaneous Order[]
 * Commit (the runner's job); chat is DECOUPLED cheap-talk (the coworld runs
 * negotiate_rounds:0), so it rides the platform `say` channel as an async bot
 * talk pass — modelled exactly like cogsul's, NOT as a turn phase.
 *
 * The client (src/client/*) is NOT served by this descriptor's wiring: in dev
 * vite serves it and proxies the API + websocket; the hub overrides `clientDir`
 * to the sibling game's vite build (dist/) anyway. `clientDir` here points at
 * that build for the hub's use.
 */
import { fileURLToPath } from "node:url";
import { type GameDescriptor, type ObservedMessage } from "@cogweb/core";
import { OpenRouterLlmClient, LlmPilot, MessageBus } from "@cogweb/llm";
import type { Audience, BotSpec, ServerMessage, TextGeneration } from "@cogweb/protocol";
import {
  cogherenceModule,
  cogherenceAutopilot,
  cogherenceGame,
  type CoghereView,
} from "./game/game.js";
import { renderSpeechMessages, parseSpeechResponse } from "./game/speech.js";
import { MAX_TURNS } from "./shared/engine/constants.js";

// One native Messages client shared by every LLM seat.
// COGHERENCE_LLM_MODEL and COGHERENCE_LLM_TIMEOUT_MS configure local play.
// Hosted COWORLD_LLM_MODEL overrides local model selection.
const client = new OpenRouterLlmClient({ prefix: "COGHERENCE" });

export const cogherenceDescriptor: GameDescriptor = {
  id: "cogherence",
  module: cogherenceModule as never,

  // Built once per instance, so the MessageBus + talk cursor below are isolated
  // between concurrent cogherence games.
  createWiring: ({ lobby, getWs }) => {
    // The negotiation substrate. Seats post implicitly (their "talk" events are
    // tapped below) and each LLM seat reads its visible slice via `visibleTo`. A
    // reset starts a fresh game, so we drop the old log by swapping in a new bus.
    let bus = new MessageBus<ObservedMessage>();

    // The talk pass fires once per turn (when a new turn opens); this is the
    // highest turn we've already talked through, so repeated snapshots in the same
    // turn don't re-fire it. Reset to 0 on a new game.
    let talkedThroughTurn = 0;

    // One LLM seat's async talk turn: ask the model (via send_messages) for chat
    // given this seat's visible inbox, and post each on the platform `say` channel.
    // Cheap talk is decoupled from the run loop, so a Bedrock hiccup just leaves
    // this seat silent for the turn (the talk analog of the runner's baseline
    // fallback) — the seat's real Commit turns still go through the runner.
    const talkForSeat = async (view: CoghereView, seat: number): Promise<void> => {
      const messages = renderSpeechMessages(view, seat, bus.visibleTo(seat));
      const user = messages[1]!.content;
      let generation: TextGeneration | undefined;
      let posts: import("@cogweb/coworld").TalkLine[];
      try {
        const reply = await client.complete({
          system: messages[0]!.content,
          slot: seat,
          messages: [{ role: "user", text: user }],
          recordGeneration: (evidence) => {
            generation = evidence;
          },
        });
        posts = parseSpeechResponse(reply.text, view, seat);
      } catch (err) {
        getWs().recordSpeech({
          seat,
          turn: view.turn,
          observation: { phase: "talk", view, inbox: bus.visibleTo(seat) },
          decision: [],
          status: "fallback",
          pilotKind: "llm",
          policy: client.model,
          attempts: [
            { prompt: user, response: generation?.response ?? "", error: String(err), generation },
          ],
        });
        console.warn(`[cogherence] talk pass failed for seat ${seat}`);
        return;
      }
      const spoken = { messages: posts };
      getWs().recordSpeech({
        seat,
        turn: view.turn,
        observation: { phase: "talk", view, inbox: bus.visibleTo(seat) },
        decision: spoken,
        status: "accepted",
        pilotKind: "llm",
        policy: client.model,
        attempts: [
          {
            prompt: user,
            response: generation!.response,
            error: null,
            generation,
            parsedAction: spoken,
          },
        ],
      });
      for (const post of posts) {
        if (post.text.trim()) getWs().say(seat, post.text, post.to === null ? "public" : [post.to]);
      }
    };

    // Per-turn bot chat pass: every autopiloted seat gets one async talk turn when
    // a turn opens. Humans don't talk here — they compose in the UI.
    const botTalkPass = (view: CoghereView): void => {
      const seats = [...lobby.botSeats().keys()];
      void Promise.all(seats.map((seat) => talkForSeat(view, seat)));
    };

    // Server-side tap on every outbound frame. "talk" events become bus messages
    // the autopilots can see; a new turn's snapshot fires the bot talk pass; a
    // "reset" frame clears the log + talk cursor for the next game.
    const onServerMessage = (m: ServerMessage): void => {
      if (m.type === "reset") {
        bus = new MessageBus<ObservedMessage>();
        talkedThroughTurn = 0;
        return;
      }
      if (m.type === "snapshot") {
        const view = m.snapshot.state as CoghereView | null;
        if (view && view.turn <= MAX_TURNS && view.turn > talkedThroughTurn) {
          talkedThroughTurn = view.turn;
          botTalkPass(view);
        }
        return;
      }
      if (m.type !== "event") return;
      const event = m.event;
      if (event.kind !== "talk") return;
      bus.post({ from: event.seat ?? -1, to: event.to, text: event.text, turn: event.turn });
    };

    // Each bot/autopilot seat gets an LlmPilot: it builds the prompt + JSON action schema from
    // `cogherenceAutopilot`, folds in this seat's visible messages, and runs the
    // robust decide loop. The seat's operator-chosen model wins; else the client's.
    const makeBotPilot = (_seat: number, spec: BotSpec): LlmPilot<unknown, unknown> =>
      new LlmPilot({
        client,
        autopilot: cogherenceAutopilot as never,
        modelFor: () => spec.model ?? client.model,
        messagesFor: (s) => bus.visibleTo(s),
      });

    return { makeBotPilot, onServerMessage };
  },

  // Pace the live game so spectators can watch, and set the auto-advance cap so a
  // stalled LLM seat (e.g. a missing Bedrock credential) falls back to the
  // baseline. cogherence's old runner gave each Commit a generous deadline; 30s
  // matches that spirit (and agricogla's cap).
  runnerOptions: { stepDelayMs: 300, maxTimeMs: 30_000 },

  // `verifySeatToken` is left UNSET → the hub denies
  // /cog/:seat/state.json by default. cogherence's `redact` keeps the requested
  // seat's OWN treasury/energy + sealed bids unmasked, so accepting any token
  // there would leak a seat's hidden state over an unauthenticated HTTP route.
  // The live console never uses that route — each ws connection gets its own
  // seat-redacted snapshot — so deny-all is correct until signed seat tokens land
  // (matches agricogla).

  // The built client (vite build -> dist/) for the hub to mount per-instance. The
  // cogweb app overrides this with the sibling game's dist anyway.
  clientDir: fileURLToPath(new URL("../dist", import.meta.url)),
};
