// DESCRIPTOR-level e2e: the cogherence GameDescriptor + autopilot + the seam
// composed through the REAL shared GameRunner with baseline (ScriptedPilot) pilots,
// to a finished state — deterministic, NO real Bedrock. Also asserts the autopilot
// surface (systemPrompt + the real submit_orders tool) and that the autopilot's
// GROUPED tool payload normalizes to the canonical `{orders}` through decisionSchema.

import { describe, it, expect } from "vitest";
import { GameRunner, ScriptedPilot } from "@cogweb/core";
import type { SeatPilot } from "@cogweb/core";
import { cogherenceDescriptor } from "../descriptor.js";
import {
  cogherenceModule,
  cogherenceGame,
  cogherenceAutopilot,
  type CoghereSeamState,
  type CoghereDecision,
} from "./game.js";
import { MAX_TURNS } from "../shared/engine/constants.js";

const COGS = 4;

function baselinePilots(n: number): Map<number, SeatPilot<CoghereSeamState, CoghereDecision>> {
  const pilots = new Map<number, SeatPilot<CoghereSeamState, CoghereDecision>>();
  for (let seat = 0; seat < n; seat++) {
    pilots.set(seat, { pilot: new ScriptedPilot(), guidance: "", model: null, name: "" });
  }
  return pilots;
}

describe("cogherence descriptor + autopilot on the seam", () => {
  it("is registered as the cogherence module with an autopilot", () => {
    expect(cogherenceDescriptor.id).toBe("cogherence");
    expect(cogherenceDescriptor.module).toBe(cogherenceModule);
    expect(cogherenceModule.autopilot).toBe(cogherenceAutopilot);
    // verifySeatToken is intentionally UNSET so /cog/:seat denies by default (no
    // hidden-state leak over the unauthenticated HTTP route).
    expect(cogherenceDescriptor.verifySeatToken).toBeUndefined();
    // A sane auto-advance cap so a stalled LLM seat falls back, not hangs.
    expect(cogherenceDescriptor.runnerOptions?.maxTimeMs).toBeGreaterThan(0);
  });

  it("exposes a system prompt and the submit_orders tool", () => {
    const s = cogherenceGame.newGame({ seed: "0", playerCount: COGS, seatNames: [] });
    const system = cogherenceAutopilot.systemPrompt({ game: cogherenceGame, seat: 0 });
    expect(system).toContain("Cogherence");

    const tool = cogherenceAutopilot.tool!(s, 0);
    expect(tool.name).toBe("submit_orders");
    expect(tool.inputSchema).toBeTruthy();

    // The observation renders the seat's own snapshot + the submit ask, and folds
    // in operator guidance.
    const obs = cogherenceAutopilot.renderObservation(s, 0, { guidance: "play aggressively", messages: [] });
    expect(obs).toContain("submit_orders");
    expect(obs.toLowerCase()).toContain("aggressively");
  });

  it("normalizes the autopilot's grouped submit_orders payload through decisionSchema", () => {
    const s = cogherenceGame.newGame({ seed: "0", playerCount: COGS, seatNames: [] });
    const schema = cogherenceGame.decisionSchema(s, 0);

    // (a) The canonical {orders} shape parses (the scripted/baseline/remote path).
    expect(schema.safeParse({ orders: [] }).success).toBe(true);

    // (b) The GROUPED submit_orders tool payload parses AND flattens to {orders}.
    const grouped = schema.parse({ aligns: [{ tile: "0,0", force: 3 }], bid: 2 });
    expect(grouped.orders).toEqual([
      { type: "align", tile: "0,0", force: 3 },
      { type: "bid", energy: 2 },
    ]);
    // A grouped payload with no fields = a legal hold (empty order set).
    expect(cogherenceGame.decisionSchema(s, 0).parse({}).orders).toEqual([]);
  });

  it("runs a full game to a finished state through the shared runner", async () => {
    const runner = new GameRunner(cogherenceModule, baselinePilots(COGS), { stepDelayMs: 0 });
    await runner.start();

    const final = runner.state as CoghereSeamState;
    expect(cogherenceGame.isFinished(final)).toBe(true);
    expect(final.engine.turn).toBe(MAX_TURNS + 1);

    // Per-seat scores are present for every seat, and at most one heart is auctioned
    // per turn so the total never exceeds the horizon.
    const score = cogherenceGame.score(final);
    expect(Object.keys(score)).toHaveLength(COGS);
    const totalHearts = Object.values(score).reduce((a, b) => a + b, 0);
    expect(totalHearts).toBeLessThanOrEqual(MAX_TURNS);
  });
});
