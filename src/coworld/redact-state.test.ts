import { describe, it, expect } from "vitest";
import { newGame, stepTurn } from "../shared/engine/game";
import { redactStateFor } from "./redact-state";

describe("redactStateFor", () => {
  it("keeps the viewer's own treasury/energy and zeroes everyone else's", () => {
    let state = newGame(7, 3);
    // Give each cog distinct holdings so redaction is observable.
    for (const id of state.cogOrder) {
      state.cogs[id]!.treasury = { C: 5, O: 4, Ge: 3, S: 2 };
      state.cogs[id]!.energy = 42;
    }
    const me = state.cogOrder[1]!;
    const view = redactStateFor(state, me);

    expect(view.cogs[me]!.treasury).toEqual({ C: 5, O: 4, Ge: 3, S: 2 });
    expect(view.cogs[me]!.energy).toBe(42);
    for (const id of state.cogOrder) {
      if (id === me) continue;
      expect(view.cogs[id]!.treasury).toEqual({ C: 0, O: 0, Ge: 0, S: 0 });
      expect(view.cogs[id]!.energy).toBe(0);
    }
  });

  it("keeps board, hearts, turn and identities public but drops the log", () => {
    let state = newGame(11, 4);
    state = stepTurn(state, {}); // produce a log entry
    expect(state.log.length).toBeGreaterThan(0);
    const me = state.cogOrder[0]!;
    const view = redactStateFor(state, me);

    expect(view.log).toEqual([]);
    expect(view.turn).toBe(state.turn);
    expect(view.cogOrder).toEqual(state.cogOrder);
    expect(Object.keys(view.tiles)).toEqual(Object.keys(state.tiles));
    for (const id of state.cogOrder) {
      expect(view.cogs[id]!.hearts).toBe(state.cogs[id]!.hearts);
      expect(view.cogs[id]!.name).toBe(state.cogs[id]!.name);
    }
  });

  it("does not mutate the source state", () => {
    const state = newGame(3, 3);
    state.cogs[state.cogOrder[2]!]!.energy = 99;
    const me = state.cogOrder[0]!;
    redactStateFor(state, me);
    expect(state.cogs[state.cogOrder[2]!]!.energy).toBe(99); // untouched
  });
});
