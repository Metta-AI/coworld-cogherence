import { describe, it, expect } from "vitest";
import { renderView, SYSTEM_PROMPT } from "./render";
import { newGame } from "../../shared/engine/game";

const view = (me = "cog0") => ({ state: newGame(7, 4), me });

describe("renderView", () => {
  it("system prompt states the goal and the submit tool", () => {
    expect(SYSTEM_PROMPT).toMatch(/hearts/i);
    expect(SYSTEM_PROMPT).toContain("submit_orders");
    expect(SYSTEM_PROMPT).toMatch(/align/);
  });
  it("user prompt names the cog, the turn, and its treasury", () => {
    const { user } = renderView(view("cog0"));
    expect(user).toContain("You are cog0");
    expect(user).toMatch(/Turn 1\/100/);
    expect(user).toMatch(/Your treasury: C\d+ O\d+ Ge\d+ S\d+/);
  });
  it("states the spendable-this-turn ceiling and the one-turn lag", () => {
    const { user } = renderView(view("cog0"));
    expect(user).toMatch(/Energy you can spend THIS turn/);
    expect(user).toMatch(/NEXT turn/);
  });
  it("lists the cog's own tiles and a frontier it may Align", () => {
    const { user } = renderView(view("cog0"));
    expect(user).toContain("Your tiles (1):"); // a fresh game gives each cog one home tile
    expect(user).toMatch(/Frontier you may Align/);
    // home tile coords appear (axial 'q,r')
    expect(user).toMatch(/\n {2}-?\d+,-?\d+ {2}coh\d+/);
  });
  it("shows the public scoreboard", () => {
    const { user } = renderView(view("cog0"));
    expect(user).toMatch(/Hearts — cog0:0 cog1:0 cog2:0 cog3:0/);
  });
});
