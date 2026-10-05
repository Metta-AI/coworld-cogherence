import { realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { cogherenceGame, type CoghereSeamState, type CoghereView } from "./game.js";
import { candidates } from "./choices.js";
import { numericEncoding } from "./numeric-codec.js";

const PLAYERS = 4;

export class NumericTrainingSession {
  private state: CoghereSeamState;
  private decisionId = 0;

  constructor(seed: string, players: number) {
    if (players !== PLAYERS) throw new Error(`Cogherence requires ${PLAYERS} players`);
    this.state = cogherenceGame.newGame({
      seed,
      playerCount: players,
      seatNames: Array.from({ length: players }, (_, seat) => `Cog ${seat + 1}`),
    });
  }

  private seat(): number {
    const seat = cogherenceGame.pendingActors(this.state)[0];
    if (seat === undefined) throw new Error("Game has no pending actor");
    return seat;
  }

  private view(): CoghereView {
    return cogherenceGame.redact(this.state, this.seat());
  }

  observation() {
    if (cogherenceGame.isFinished(this.state)) {
      return { kind: "terminal" as const, scores: cogherenceGame.score(this.state) };
    }
    const seat = this.seat();
    const view = this.view();
    const choices = candidates(view, seat);
    return {
      kind: "decision" as const,
      inference_mode: null,
      game: "cogherence",
      decision_id: this.decisionId,
      seat,
      engine_seat: seat,
      turn: view.turn,
      semantic_view: view,
      inbox: [],
      messages: [],
      speech_messages: [],
      action_schema: {
        type: "object",
        properties: { choice: { type: "string", enum: choices.map((choice) => choice.key) } },
        required: ["choice"],
      },
      typed_question: {
        state: view,
        instructions: "Choose a legal order set for this turn.",
        language: null,
        candidates: Object.fromEntries(
          choices.map((choice) => [
            choice.key,
            { decision: { choice: choice.key }, criterion: choice.description },
          ]),
        ),
      },
    };
  }

  encode() {
    return numericEncoding(this.view(), this.seat(), this.decisionId);
  }

  teacher() {
    return { response: JSON.stringify({ choice: "hold" }) };
  }

  step(decisionId: number, response: string) {
    if (decisionId !== this.decisionId || cogherenceGame.isFinished(this.state))
      return { kind: "rejected" as const, reason: "stale decision" };
    const parsed = z.object({ choice: z.string() }).strict().parse(JSON.parse(response));
    const selected = candidates(this.view(), this.seat()).find(
      (choice) => choice.key === parsed.choice,
    );
    if (!selected) return { kind: "rejected" as const, reason: "unknown choice" };
    const action = cogherenceGame
      .decisionSchema(this.state, this.seat())
      .parse({ orders: selected.orders });
    this.state = cogherenceGame.applyDecision(this.state, this.seat(), action).state;
    this.decisionId++;
    return {
      kind: "accepted" as const,
      action: { choice: selected.key },
      observation: this.observation(),
    };
  }
}

const Command = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reset"), seed: z.string(), players: z.number().int() }),
  z.object({ kind: z.literal("encode") }),
  z.object({ kind: z.literal("teacher") }),
  z.object({ kind: z.literal("step"), decision_id: z.number().int(), response: z.string() }),
]);

export async function runNumericBridge(): Promise<void> {
  let session: NumericTrainingSession | undefined;
  for await (const line of createInterface({ input: process.stdin })) {
    const command = Command.parse(JSON.parse(line));
    if (command.kind === "reset")
      session = new NumericTrainingSession(command.seed, command.players);
    if (!session) throw new Error("reset required");
    const response =
      command.kind === "reset"
        ? session.observation()
        : command.kind === "encode"
          ? session.encode()
          : command.kind === "teacher"
            ? session.teacher()
            : session.step(command.decision_id, command.response);
    process.stdout.write(JSON.stringify(response) + "\n");
  }
}

if (realpathSync(argv[1]!) === fileURLToPath(import.meta.url)) await runNumericBridge();
