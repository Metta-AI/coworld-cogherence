// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { App } from "./App";
import { makeReplay } from "../shared/replay";
import { greedyAgent, peacefulAgent } from "../agents/stub";
import { parseReplay } from "./replay-source";

const replay = () => parseReplay(makeReplay(7, ["greedy", "peaceful"], [greedyAgent("cog0"), peacefulAgent("cog1")]));

describe("App", () => {
  it("renders the board for an injected replay", () => {
    const { container } = render(<App replay={replay()} />);
    expect(container.querySelectorAll("polygon")).toHaveLength(127);
  });
  it("steps the turn forward", () => {
    const { getByLabelText, getByTestId } = render(<App replay={replay()} />);
    const before = getByTestId("turn-label").textContent;
    fireEvent.click(getByLabelText("step forward"));
    expect(getByTestId("turn-label").textContent).not.toBe(before);
  });
});
