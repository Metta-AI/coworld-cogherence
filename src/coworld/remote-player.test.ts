import { describe, it, expect, vi } from "vitest";
import { newGame } from "../shared/engine/game";
import type { AgentView } from "../agents/types";
import type { GameToPlayer } from "./protocol";
import { RemotePlayerAgent, type PlayerSink } from "./remote-player";

function setup(backstopMs = 10_000) {
  const sent: GameToPlayer[] = [];
  const sink: PlayerSink = { send: (t) => sent.push(JSON.parse(t) as GameToPlayer) };
  const state = newGame(7, 3);
  const me = state.cogOrder[0]!;
  const agent = new RemotePlayerAgent({ id: me, slot: 0, backstopMs });
  const view: AgentView = { state, me, messages: [] };
  const hello: GameToPlayer & { type: "hello" } = { type: "hello", slot: 0, you: me, name: "P0", players: [], seed: 7, maxTurns: 10 };
  return { sent, sink, state, me, agent, view, hello };
}

describe("RemotePlayerAgent", () => {
  it("with no player connected, commit resolves empty immediately", async () => {
    const { agent, view } = setup();
    expect(await agent.commit(view)).toEqual([]);
    expect(agent.connected).toBe(false);
  });

  it("sends a commit request and resolves with the player's orders", async () => {
    const { sent, sink, agent, view, hello } = setup();
    agent.attach(sink, hello);
    expect(sent[0]).toEqual(hello);
    const p = agent.commit(view);
    const req = sent[1]!;
    expect(req.type).toBe("commit");
    expect((req as Extract<GameToPlayer, { type: "commit" }>).turn).toBe(view.state.turn);
    agent.deliver({ type: "commit_result", turn: view.state.turn, orders: [{ type: "bid", energy: 3 }] });
    expect(await p).toEqual([{ type: "bid", energy: 3 }]);
  });

  it("redacts opponents' treasury/energy in the view it sends", async () => {
    const { sent, sink, agent, view, hello, state, me } = setup();
    for (const id of state.cogOrder) {
      state.cogs[id]!.treasury = { C: 9, O: 9, Ge: 9, S: 9 };
      state.cogs[id]!.energy = 50;
    }
    agent.attach(sink, hello);
    void agent.commit(view);
    const req = sent[1] as Extract<GameToPlayer, { type: "commit" }>;
    expect(req.view.state.cogs[me]!.energy).toBe(50);
    for (const id of state.cogOrder) {
      if (id === me) continue;
      expect(req.view.state.cogs[id]!.energy).toBe(0);
      expect(req.view.state.cogs[id]!.treasury).toEqual({ C: 0, O: 0, Ge: 0, S: 0 });
    }
  });

  it("pushes an async message frame to the player", () => {
    const { sent, sink, agent, hello } = setup();
    agent.attach(sink, hello);
    agent.pushMessage({ type: "message", message: { seq: 1, turn: 2, from: "cog1", to: "public", text: "hi" } });
    expect(sent[1]).toEqual({ type: "message", message: { seq: 1, turn: 2, from: "cog1", to: "public", text: "hi" } });
  });

  it("drops a commit_result whose turn does not match the open request", async () => {
    vi.useFakeTimers();
    const { sink, agent, view, hello } = setup(500);
    agent.attach(sink, hello);
    const p = agent.commit(view); // turn 1
    agent.deliver({ type: "commit_result", turn: 99, orders: [{ type: "bid", energy: 7 }] });
    await vi.advanceTimersByTimeAsync(500); // backstop → []
    expect(await p).toEqual([]);
    vi.useRealTimers();
  });

  it("backstops a silent player to [] after the deadline", async () => {
    vi.useFakeTimers();
    const { sink, agent, view, hello } = setup(500);
    agent.attach(sink, hello);
    const p = agent.commit(view);
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toEqual([]);
    vi.useRealTimers();
  });

  it("a disconnect resolves the open commit to []", async () => {
    const { sink, agent, view, hello } = setup();
    agent.attach(sink, hello);
    const p = agent.commit(view);
    agent.detach();
    expect(await p).toEqual([]);
    expect(agent.connected).toBe(false);
  });
});
