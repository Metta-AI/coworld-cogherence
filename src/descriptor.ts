/**
 * Reusable descriptor for Cogherence on the shared @cogweb/core platform.
 * `cogherenceDescriptor` is the unit the hub spins instances of: it carries the
 * pure module plus a `createWiring` factory
 * called ONCE PER INSTANCE, so every concurrent cogherence game gets its own
 * `MessageBus` and talk cursor instead of sharing one.
 *
 * LLM seats are driven by `LlmPilot` over Bedrock; the cross-seat negotiation
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
import { BedrockLlmClient, LlmPilot, MessageBus } from "@cogweb/llm";
import type { Audience, BotSpec, ServerMessage } from "@cogweb/protocol";
import { cogherenceModule, cogherenceAutopilot, cogherenceGame, type CoghereView } from "./game/game.js";
import { SEND_MESSAGES_TOOL, parsePosts } from "./agents/llm/negotiate.js";
import { MAX_TURNS } from "./shared/engine/constants.js";
import type { Post } from "./agents/types.js";

// One Bedrock client for every LLM seat. `prefix: "COGHERENCE"` reads
// COGHERENCE_BEDROCK_MODEL / _REGION / _TIMEOUT_MS, falling back to the
// unprefixed BEDROCK_* / AWS_REGION so a plain Bedrock shell works out of the
// box. No per-instance state, so it stays module-level and is shared.
const client = new BedrockLlmClient({ prefix: "COGHERENCE" });

// Resolve a cogherence Post's audience ("public" | a cog id) to a wire
// `Audience`: a public broadcast, or the seat list for a DM (the recipient cog
// id mapped to its seat). An unknown recipient falls back to public. Pure, so it
// stays module-level (no per-instance state).
const audienceOf = (view: CoghereView, post: Post): Audience => {
  if (post.to === "public") return "public";
  const recipient = view.cogs.findIndex((c) => c.id === post.to);
  return recipient >= 0 ? [recipient] : "public";
};

// The talk-pass observation for one seat: cogherence's negotiate framing rendered
// off the REDACTED public snapshot (only the seat's own treasury + the public
// hearts board) plus the seat's visible inbox. Pure; the descriptor renders the
// system prompt from the autopilot and this for the user turn.
const renderTalk = (view: CoghereView, seat: number, messages: ObservedMessage[]): string => {
  const me = view.cogs[seat];
  const lines: string[] = [
    `Turn ${view.turn}/${MAX_TURNS}. You are ${me?.id ?? `seat ${seat}`}. NEGOTIATION (free-flowing cheap talk — it is not a turn phase).`,
  ];
  if (me) lines.push(`Your treasury: C${me.treasury.C} O${me.treasury.O} Ge${me.treasury.Ge} S${me.treasury.S} (${me.energy} energy stored).`);
  lines.push("Hearts — " + view.cogs.map((c) => `${c.id}:${c.hearts}`).join(" "));
  if (messages.length > 0) {
    lines.push("Recent messages you can see:");
    for (const m of messages.slice(-12)) {
      const fromId = view.cogs[m.from]?.id ?? `seat ${m.from}`;
      const scope = m.to === "public" ? "(public)" : "(to you)";
      lines.push(`  ${fromId} ${scope}: ${m.text}`);
    }
  } else {
    lines.push("(no messages yet)");
  }
  const others = view.cogs.filter((_, i) => i !== seat).map((c) => c.id).join(", ");
  lines.push(
    `\nSend public messages (to "public") or private DMs (to a cog id like "${others.split(", ")[0] ?? "cog1"}") to form alliances, propose mineral trades, bluff, or threaten — nothing is binding, and you can betray later. Others: ${others}. Call send_messages with your messages (empty list to stay silent). One or two sentences each.`,
  );
  return lines.join("\n");
};

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
      const system = cogherenceAutopilot.systemPrompt({ game: cogherenceGame, seat });
      const user = renderTalk(view, seat, bus.visibleTo(seat));
      let toolInput: unknown;
      try {
        const reply = await client.converse({
          system,
          messages: [{ role: "user", text: user }],
          tool: SEND_MESSAGES_TOOL,
        });
        toolInput = reply.toolInput;
      } catch (err) {
        console.warn(`[cogherence] talk pass failed for seat ${seat}: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      for (const post of parsePosts(toolInput).slice(0, 2)) {
        if (post.text.trim()) getWs().say(seat, post.text, audienceOf(view, post));
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

    // Each bot/autopilot seat gets an LlmPilot: it builds the prompt + tool from
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
