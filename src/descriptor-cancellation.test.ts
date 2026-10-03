import { afterEach, expect, it, vi } from "vitest";
import { cogherenceGame } from "./game/game.js";
import type { DecisionTelemetryEvent } from "@cogweb/core";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("freezes interrupted grouped speech against its original view and never posts a late completion", async () => {
  vi.stubEnv("COWORLD_LLM_ENDPOINT", "http://native.test");
  vi.stubEnv("COWORLD_LLM_MODEL", "checkpoint/fixture");
  let release!: (response: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const { cogherenceDescriptor } = await import("./descriptor.js");
  const records: DecisionTelemetryEvent<unknown>[] = [];
  const say = vi.fn();
  const wiring = cogherenceDescriptor.createWiring!({
    lobby: { botSeats: () => new Map([[0, {}]]) },
    getWs: () => ({
      recordSpeech: (event: DecisionTelemetryEvent<unknown>) => records.push(event),
      say,
    }),
  } as never);
  const state = cogherenceGame.newGame({
    playerCount: 4,
    seed: "talk-cancel",
    seatNames: ["CogA", "CogB", "CogC", "CogD"],
  });
  const view = cogherenceGame.redact(state, 0);
  wiring.onServerMessage!({ type: "snapshot", snapshot: { state: view } } as never);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  wiring.onServerMessage!({ type: "reset" } as never);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    purpose: "learner",
    status: "fallback",
    decision: [],
    attempts: [{ generation: { platformCallId: null, request: { model: "checkpoint/fixture" } } }],
  });
  const before = structuredClone(records);
  release(
    new Response(
      JSON.stringify({
        model: "checkpoint/fixture",
        choices: [
          {
            message: {
              content: JSON.stringify({ messages: [{ to: "public", text: "late post" }] }),
            },
          },
        ],
      }),
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(say).not.toHaveBeenCalled();
  expect(records).toEqual(before);
});
