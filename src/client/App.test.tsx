// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { App } from "./App";
import { makeReplay } from "../shared/replay";
import { greedyAgent, peacefulAgent } from "../agents/stub";

// makeReplay runs the engine with scripted agents and returns a Replay of
// cogherence's internal ServerMessages — the App's injected-replay seam applies
// them straight through applyFrame (the same frames the @cogweb adapter emits live).
const replay = async () => makeReplay(7, ["greedy", "peaceful"], [greedyAgent("cog0"), peacefulAgent("cog1")]);

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("App", () => {
  it("renders the board for an injected replay", async () => {
    const { container } = render(<App replay={await replay()} />);
    expect(container.querySelectorAll("g.cg-tile")).toHaveLength(127);
  });

  it("loads a static Coworld replay from the replay query", async () => {
    const recorded = await replay();
    const snapshot = recorded.frames.find((frame) => frame.type === "snapshot");
    if (snapshot?.type !== "snapshot") throw new Error("fixture has no snapshot");
    const artifact = {
      protocol: "cogweb.replay.v1",
      frames: [{ type: "snapshot", snapshot: { turn: snapshot.snapshot.turn, generation: 1, state: snapshot.snapshot } }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(artifact))));
    window.history.replaceState(null, "", "/index.html?replay=https%3A%2F%2Fartifacts.example%2Freplay");

    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelectorAll("g.cg-tile")).toHaveLength(127));
  });

  it("steps the turn forward", async () => {
    const { container } = render(<App replay={await replay()} />);
    // The scrubber readout (cogui-sbar-rnum) shows the viewed turn; → scrubs it.
    const readout = (): string | null | undefined => container.querySelector(".cogui-sbar-rnum")?.textContent;
    const before = readout();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(readout()).not.toBe(before);
  });

  it("syncs the turn log to the scrubber — empty at turn 1, populated as you advance", async () => {
    const { getByTestId } = render(<App replay={await replay()} />);
    const log = getByTestId("turn-log");
    // Turn 1 is the opening board: nothing has resolved yet.
    expect(log.textContent).toContain("nothing has resolved yet");
    expect(log.querySelectorAll(".cg-verb")).toHaveLength(0);
    // Advancing the board (→ scrubs one turn) reveals the events that resolved on
    // the way here. The log shows ONE turn's actions, and quiet turns are common
    // on a half-barren board — step until an action line appears.
    let found = 0;
    for (let i = 0; i < 30 && found === 0; i++) {
      fireEvent.keyDown(window, { key: "ArrowRight" });
      found = log.querySelectorAll(".cg-verb").length;
    }
    expect(found).toBeGreaterThan(0);
  });
});
