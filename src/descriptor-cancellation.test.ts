import { afterEach, expect, it, vi } from "vitest";
import { cogherenceGame } from "./game/game.js";
import type { DecisionTelemetryEvent } from "@cogweb/core";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
it.each(["cooperative", "uncooperative"])(
  "seals %s interrupted speech, joins within its bound, and never posts late output",
  async (cooperation) => {
    vi.stubEnv("COWORLD_LLM_ENDPOINT", "http://native.test");
    vi.stubEnv("COWORLD_LLM_MODEL", "checkpoint/fixture");
    vi.stubEnv("COGHERENCE_LLM_TIMEOUT_MS", "100");
    let release!: (response: Response) => void;
    let aborted = false;
    let settled = false;
    const fetch = vi.fn((_url: unknown, options: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        release = resolve;
        options.signal!.addEventListener(
          "abort",
          () => {
            aborted = true;
            if (cooperation === "cooperative") reject(options.signal!.reason);
          },
          { once: true },
        );
      }).finally(() => {
        settled = true;
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
      attempts: [
        { generation: { platformCallId: null, request: { model: "checkpoint/fixture" } } },
      ],
    });
    expect(aborted).toBe(true);
    const before = structuredClone(records);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(settled).toBe(cooperation === "cooperative");
    expect(records).toEqual(before);
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
  },
);
