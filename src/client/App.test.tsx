// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { App } from "./App";
import { makeReplay } from "../shared/replay";
import { greedyAgent, peacefulAgent } from "../agents/stub";
import { parseReplay } from "./replay-source";

const replay = async () => parseReplay(await makeReplay(7, ["greedy", "peaceful"], [greedyAgent("cog0"), peacefulAgent("cog1")]));

describe("App", () => {
  it("renders the board for an injected replay", async () => {
    const { container } = render(<App replay={await replay()} />);
    expect(container.querySelectorAll("polygon")).toHaveLength(127);
  });
  it("steps the turn forward", async () => {
    const { getByLabelText, getByTestId } = render(<App replay={await replay()} />);
    const before = getByTestId("turn-label").textContent;
    fireEvent.click(getByLabelText("step forward"));
    expect(getByTestId("turn-label").textContent).not.toBe(before);
  });

  it("syncs the activity ticker to the scrubber — no events at turn 1, more as you advance", async () => {
    const { getByLabelText, getByTestId } = render(<App replay={await replay()} />);
    const ticker = getByTestId("ticker");
    // Turn 1 is the opening board: nothing has resolved yet.
    expect(ticker.querySelectorAll("li.ev")).toHaveLength(0);
    expect(ticker.textContent).toContain("No events yet.");
    // Advancing the board reveals the events that resolved on the way here.
    for (let i = 0; i < 5; i++) fireEvent.click(getByLabelText("step forward"));
    expect(ticker.querySelectorAll("li.ev").length).toBeGreaterThan(0);
  });
});
