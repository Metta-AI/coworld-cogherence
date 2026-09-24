import { afterEach, describe, expect, it, vi } from "vitest";

import { cogherenceGame, cogherenceModule } from "./game.js";
import { candidates, talk } from "./jev-player.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Cogherence Jev candidates", () => {
  it("does not sacrifice the only owned tile", () => {
    const state = cogherenceGame.newGame({ seed: "7", playerCount: 4, seatNames: [] });
    const view = cogherenceGame.redact(state, 0);
    expect(view.tiles.filter((tile) => tile.alignment === view.cogs[0]!.id)).toHaveLength(1);
    expect(candidates(view, 0).some((candidate) => candidate.orders.some((order) => order.type === "exploit"))).toBe(false);
    expect(candidates(view, 0).some((candidate) => candidate.key === "bid_1")).toBe(true);
  });
});

it("uses normal chat text for public negotiation alongside typed Jev orders", async () => {
  vi.stubEnv("AWS_ENDPOINT_URL_BEDROCK_RUNTIME", "http://127.0.0.1:9100");
  const state = cogherenceGame.newGame({ seed: "7", playerCount: 4, seatNames: [] });
  const view = cogherenceGame.redact(state, 0);
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { content: "  I will spare your northern tile if you stop bidding.  " } }],
  }), { status: 200 }));
  const ctx = {
    view, seat: 0, turn: 1, messages: [{ from: 1, to: "public" as const, text: "Will you make a deal?", turn: 1 }],
    reason: null, timeLeftMs: null, config: {}, module: cogherenceModule,
  };
  expect(await talk(ctx)).toEqual([{ to: null, text: "I will spare your northern tile if you stop bidding." }]);
  expect(request).toHaveBeenCalledOnce();
  const [url, init] = request.mock.calls[0]!;
  expect(url).toBe("http://127.0.0.1:9100/v1/chat/completions");
  expect((init?.headers as Record<string, string>)["X-Coworld-Player-Slot"]).toBe("0");
  const body = JSON.parse(init?.body as string);
  expect(body.model).toBe("anthropic/claude-haiku-4.5");
  expect(body.messages[1].content).toContain("Will you make a deal?");
  expect(body.questions).toBeUndefined();
  expect(await talk({ ...ctx, turn: 2 })).toEqual([]);
  expect(await talk({ ...ctx, reason: "rejected" })).toEqual([]);
  expect(request).toHaveBeenCalledOnce();
});
