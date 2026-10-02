import { realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { ObservedMessage } from "@cogweb/core";
import type { TalkLine } from "@cogweb/coworld";
import { MessageBus, parseJsonAction } from "@cogweb/llm";
import {
  cogherenceGame,
  cogherenceAutopilot,
  renderPlayerMessages,
  type CoghereSeamState,
} from "./game.js";
import { renderSpeechMessages, normalizePosts } from "./speech.js";
import { SEND_MESSAGES_FORMAT, sendMessagesSchema } from "../agents/llm/negotiate.js";
import { resolve } from "../shared/engine/resolve.js";

/** Direct language actions use exactly the ordinary native player's messages. */
export class TrainingSession {
  private state: CoghereSeamState;
  private decisionId = 0;
  private reason: string | null = null;
  private parseReason: string | null = null;
  private localAttempts = 0;
  private hostAttempts = 0;
  private readonly bus = new MessageBus<ObservedMessage>();
  private phase: "talk" | "orders" = "talk";
  private heldInbox: ObservedMessage[] | null = null;
  private pendingSpeech: TalkLine[] | null = null;
  constructor(seed: string, players: number) {
    if (players !== 4) throw new Error("Cogherence requires four players");
    this.state = cogherenceGame.newGame({
      seed,
      playerCount: players,
      seatNames: Array.from({ length: players }, (_, seat) => `Cog ${seat + 1}`),
    });
  }
  observation() {
    if (cogherenceGame.isFinished(this.state))
      return { kind: "terminal" as const, scores: cogherenceGame.score(this.state) };
    const seat = cogherenceGame.pendingActors(this.state)[0]!;
    const view = cogherenceGame.redact(this.state, seat);
    this.heldInbox ??= this.bus.visibleTo(seat);
    if (this.phase === "talk")
      return {
        kind: "decision" as const,
        game: "cogherence",
        decision_id: this.decisionId,
        seat,
        engine_seat: seat,
        turn: view.turn,
        inference_mode: "text_action" as const,
        semantic_view: view,
        inbox: this.heldInbox,
        messages: renderSpeechMessages(view, seat, this.heldInbox),
        speech_messages: [],
        action_schema: SEND_MESSAGES_FORMAT.inputSchema,
        typed_question: null,
      };
    return {
      kind: "decision" as const,
      game: "cogherence",
      decision_id: this.decisionId,
      seat,
      engine_seat: seat,
      turn: view.turn,
      inference_mode: "text_action" as const,
      semantic_view: view,
      inbox: this.heldInbox,
      messages: renderPlayerMessages(view, seat, this.reason, "", this.heldInbox).map((message) =>
        message.role === "user" && this.parseReason
          ? { ...message, content: message.content + `\n\n${this.parseReason}` }
          : message,
      ),
      speech_messages: [],
      action_schema: cogherenceAutopilot.actionSchema!(this.state, seat).inputSchema,
      typed_question: null,
    };
  }
  teacher() {
    return { response: this.phase === "talk" ? '{"messages":[]}' : "{}" };
  }
  step(decisionId: number, response: string) {
    const observation = this.observation();
    if (observation.kind !== "decision" || decisionId !== this.decisionId)
      return { kind: "rejected" as const, reason: "stale decision", observation };
    if (this.phase === "talk") {
      const json = parseJsonAction(response);
      if (json.kind === "rejected") return this.speech([], json.reason);
      const parsed = sendMessagesSchema.safeParse(json.value);
      if (!parsed.success) return this.speech([], parsed.error.message);
      return this.speech(
        normalizePosts(parsed.data, observation.semantic_view, observation.seat),
        null,
      );
    }
    this.localAttempts++;
    const json = parseJsonAction(response);
    if (json.kind === "rejected") return this.rejectParse(json.reason);
    const parsed = cogherenceGame
      .decisionSchema(this.state, observation.seat)
      .safeParse(json.value);
    if (!parsed.success) return this.rejectParse(parsed.error.message);
    this.localAttempts = 0;
    this.parseReason = null;
    this.flushSpeech();
    const id = this.state.engine.cogOrder[observation.seat]!;
    const probe = resolve(structuredClone(this.state.engine), { [id]: parsed.data.orders });
    const rejected = probe.events.find((event) => event.type === "rejected" && event.cog === id);
    this.reason = rejected?.type === "rejected" ? rejected.reason : null;
    if (this.reason !== null) {
      this.hostAttempts++;
      if (this.hostAttempts >= 3)
        return this.apply(
          cogherenceGame.baselineDecision(this.state, observation.seat),
          this.reason,
        );
      this.heldInbox = this.bus.visibleTo(observation.seat);
      return { kind: "rejected" as const, reason: this.reason, observation: this.observation() };
    }
    return this.apply(parsed.data, null);
  }
  private speech(messages: TalkLine[], reason: string | null) {
    this.pendingSpeech = messages;
    this.phase = "orders";
    this.decisionId++;
    const action = { messages };
    return reason === null
      ? { kind: "accepted" as const, action, observation: this.observation() }
      : { kind: "consumed_rejection" as const, reason, action, observation: this.observation() };
  }
  private flushSpeech() {
    if (this.pendingSpeech === null) return;
    const seat = cogherenceGame.pendingActors(this.state)[0]!;
    for (const line of this.pendingSpeech)
      this.bus.post({
        from: seat,
        to: line.to === null ? "public" : [line.to],
        text: line.text,
        turn: cogherenceGame.turnOf(this.state),
      });
    this.pendingSpeech = null;
  }

  private rejectParse(reason: string) {
    this.parseReason = reason;
    if (this.localAttempts < 3)
      return { kind: "rejected" as const, reason, observation: this.observation() };
    return this.apply(
      cogherenceGame.baselineDecision(this.state, cogherenceGame.pendingActors(this.state)[0]!),
      reason,
    );
  }
  private apply(
    action: { orders: import("../shared/engine/orders.js").Order[] },
    reason: string | null,
  ) {
    const seat = cogherenceGame.pendingActors(this.state)[0]!;
    this.flushSpeech();
    this.state = cogherenceGame.applyDecision(this.state, seat, action).state;
    this.decisionId++;
    this.phase = "talk";
    this.heldInbox = null;
    this.localAttempts = 0;
    this.hostAttempts = 0;
    this.reason = null;
    this.parseReason = null;
    return reason === null
      ? { kind: "accepted" as const, action, observation: this.observation() }
      : { kind: "consumed_rejection" as const, reason, action, observation: this.observation() };
  }
}
const Command = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reset"), seed: z.string(), players: z.number().int() }),
  z.object({ kind: z.literal("teacher") }),
  z.object({ kind: z.literal("step"), decision_id: z.number().int(), response: z.string() }),
]);
export async function runTrainingBridge(): Promise<void> {
  let session: TrainingSession | undefined;
  for await (const line of createInterface({ input: process.stdin })) {
    const command = Command.parse(JSON.parse(line));
    if (command.kind === "reset") session = new TrainingSession(command.seed, command.players);
    if (!session) throw new Error("reset required");
    const response =
      command.kind === "reset"
        ? session.observation()
        : command.kind === "teacher"
          ? session.teacher()
          : session.step(command.decision_id, command.response);
    process.stdout.write(JSON.stringify(response) + "\n");
  }
}
if (realpathSync(argv[1]!) === fileURLToPath(import.meta.url)) await runTrainingBridge();
