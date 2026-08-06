import { describe, it, expect } from "vitest";
import { makeCogwebDecoder } from "./cogweb-feed";
import type { GameSnapshot } from "../../shared/snapshot";

// A minimal-but-valid cogherence GameSnapshot — the shape the hub puts in
// `snapshot.state` (it IS cogherence's redacted view; see game/game.ts).
const SNAP: GameSnapshot = {
  version: "0.1.0",
  seed: 0,
  turn: 4,
  phase: "auction",
  radius: 6,
  coherenceMax: 10,
  tiles: [{ q: 0, r: 0, alignment: "cog2", coherence: 10, mineral: "C", density: 10, density0: 10 }],
  cogs: [
    { id: "cog0", index: 0, name: "Bot 0", hearts: 1, treasury: { C: 10, O: 0, Ge: 0, S: 0 }, energy: 49 },
    { id: "cog1", index: 1, name: "Bot 1", hearts: 0, treasury: { C: 0, O: 0, Ge: 0, S: 0 }, energy: 50 },
  ],
};

describe("makeCogwebDecoder", () => {
  it("unwraps a snapshot frame's state into a cogherence snapshot", () => {
    const decode = makeCogwebDecoder();
    const out = decode({ type: "snapshot", snapshot: { turn: 4, generation: 0, state: SNAP } });
    expect(out).toEqual([{ type: "snapshot", snapshot: SNAP }]);
  });

  it("unwraps a board event's TurnEvent (data) into a cogherence event", () => {
    const decode = makeCogwebDecoder();
    const data = { type: "mint", cog: "cog0", gained: { C: 10, O: 0, Ge: 0, S: 0 } };
    const out = decode({ type: "event", event: { turn: 4, seat: 0, kind: "mint", text: "cog0 minted…", to: "public", data } });
    expect(out).toEqual([{ type: "event", event: data, turn: 4 }]);
  });

  it("turns a talk FeedEvent into a chat message (seat → cog id, audience → cog id)", () => {
    const decode = makeCogwebDecoder();
    const pub = decode({ type: "event", event: { turn: 3, seat: 1, kind: "talk", text: "hi all", to: "public" } });
    expect(pub).toEqual([{ type: "message", message: { seq: 0, turn: 3, from: "cog1", to: "public", text: "hi all" } }]);
    const dm = decode({ type: "event", event: { turn: 3, seat: 1, kind: "talk", text: "psst", to: [0] } });
    expect(dm).toEqual([{ type: "message", message: { seq: 1, turn: 3, from: "cog1", to: "cog0", text: "psst" } }]);
  });

  it("drops a board event whose data is not a valid TurnEvent", () => {
    const decode = makeCogwebDecoder();
    expect(decode({ type: "event", event: { turn: 1, seat: 0, kind: "order", text: "x", to: "public", data: { bogus: true } } })).toEqual([]);
  });

  it("maps a RunStatus into a cogherence ServerStatus (phase from the latest snapshot)", () => {
    const decode = makeCogwebDecoder();
    decode({ type: "snapshot", snapshot: { turn: 4, generation: 0, state: SNAP } }); // seeds phase = "auction"
    const out = decode({
      type: "status",
      status: { phase: "running", turn: 4, live: true, thinking: [0], ready: [], seatStatus: { "0": "thinking", "1": "waiting" }, scores: { "0": 1, "1": 0 }, autoAdvance: true, maxTimeMs: 30000, deadline: 123 },
    });
    expect(out).toHaveLength(1);
    const s = out[0]!;
    expect(s.type).toBe("serverStatus");
    if (s.type !== "serverStatus") throw new Error("expected serverStatus");
    expect(s.status).toMatchObject({
      turn: 4,
      phase: "auction",
      finished: false,
      started: true,
      ended: false,
      pending: ["cog0"],
      done: ["cog1"],
      phaseDeadlineAt: 123,
      waitReady: false,
    });
  });

  it("marks a finished run as finished + ended", () => {
    const decode = makeCogwebDecoder();
    const out = decode({ type: "status", status: { phase: "finished", turn: 100, live: false, thinking: [], ready: [], seatStatus: {}, scores: { "0": 3 }, autoAdvance: false, maxTimeMs: 0, deadline: null } });
    const s = out[0]!;
    if (s.type !== "serverStatus") throw new Error("expected serverStatus");
    expect(s.status).toMatchObject({ finished: true, ended: true, started: true, waitReady: true });
  });

  it("maps a lobby frame to a started:false ServerStatus with a roster", () => {
    const decode = makeCogwebDecoder();
    const lobby = {
      gameId: "g", generation: 0, phase: "lobby", autoAdvance: { enabled: true, maxTimeMs: 30000 }, rules: {},
      seats: [
        { seat: 0, name: "Bot 0", kind: "bot", ready: true, connected: false, bot: { model: null, guidance: "", autopilot: true }, joinToken: "t0" },
        { seat: 1, name: "", kind: "open", ready: false, connected: false, bot: null, joinToken: "t1" },
      ],
    };
    const out = decode({ type: "lobby", lobby });
    const s = out[0]!;
    if (s.type !== "serverStatus") throw new Error("expected serverStatus");
    expect(s.status.started).toBe(false);
    expect(s.status.roster).toEqual([
      { id: "cog0", name: "Bot 0", bot: true },
      { id: "cog1", name: "", bot: false },
    ]);
  });

  it("maps an actPrompt to a cogherence actPrompt (seat → cog id, content from the last attempt)", () => {
    const decode = makeCogwebDecoder();
    decode({ type: "snapshot", snapshot: { turn: 2, generation: 0, state: { ...SNAP, phase: "commit" } } });
    const out = decode({ type: "actPrompt", actPrompt: { turn: 2, seat: 0, phase: null, attempts: [{ prompt: "P", response: "R", error: null }], usedFallback: false, model: null } });
    expect(out).toEqual([{ type: "actPrompt", cogId: "cog0", turn: 2, phase: "commit", content: "P\n\n→ R" }]);
  });

  it("drops reset frames (the next game's first snapshot wipes the store) and unparseable input", () => {
    const decode = makeCogwebDecoder();
    expect(decode({ type: "reset", generation: 1 })).toEqual([]);
    expect(decode({ type: "garbage" })).toEqual([]);
    expect(decode("not even an object")).toEqual([]);
  });
});
