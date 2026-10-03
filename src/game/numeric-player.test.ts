import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { numericDecide } from "./numeric-player.js";
import { cogherenceGame, cogherenceModule } from "./game.js";
import { candidates } from "./choices.js";
import { numericEncoding } from "./numeric-codec.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

describe("ordinary numeric player", () => {
  it("sends its numeric private view and applies a non-hold reply through the game gate", async () => {
    const state = cogherenceGame.newGame({ seed: "19", playerCount: 4, seatNames: ["a", "b", "c", "d"] });
    const view = cogherenceGame.redact(state, 0);
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const part of request) body += part;
      expect(JSON.parse(body)).toEqual({
        session: "proof",
        seat: 0,
        decision_id: view.turn,
        values: numericEncoding(view, 0, view.turn).values,
        action_mask: numericEncoding(view, 0, view.turn).actions.map((action) => action !== null),
      });
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choice: 1 }));
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const decide = numericDecide(`http://127.0.0.1:${(server.address() as AddressInfo).port}/choice`, "proof");
    const action = await decide({
      view,
      seat: 0,
      turn: view.turn,
      messages: [],
      reason: null,
      timeLeftMs: null,
      config: undefined,
      module: cogherenceModule,
    });
    expect(action).toEqual({ orders: candidates(view, 0)[1]!.orders });
    const next = cogherenceGame.applyDecision(state, 0, action).state;
    expect(cogherenceGame.pendingActors(next)).toEqual([1, 2, 3]);
  });

  it("rejects masked policy output instead of submitting a different action", async () => {
    const state = cogherenceGame.newGame({ seed: "19", playerCount: 4, seatNames: ["a", "b", "c", "d"] });
    const view = cogherenceGame.redact(state, 0);
    const server = createServer((_request, response) => response.end(JSON.stringify({ choice: 29 })));
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const decide = numericDecide(`http://127.0.0.1:${(server.address() as AddressInfo).port}/choice`, "proof");
    expect(candidates(view, 0).length).toBeLessThan(30);
    await expect(
      decide({
        view,
        seat: 0,
        turn: view.turn,
        messages: [],
        reason: null,
        timeLeftMs: null,
        config: undefined,
        module: cogherenceModule,
      }),
    ).rejects.toThrow();
    expect(cogherenceGame.pendingActors(state)).toEqual([0, 1, 2, 3]);
  });
});
