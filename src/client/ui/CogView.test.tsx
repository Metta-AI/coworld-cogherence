// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CogView } from "./CogView";
import { toSnapshot } from "../../shared/snapshot";
import { newGame } from "../../shared/engine/game";

describe("CogView", () => {
  const snap = toSnapshot(newGame(7, 4));
  it("renders the board, banner, and a private inbox", () => {
    const { container, getByTestId } = render(
      <CogView
        snapshot={snap}
        cogId="cog0"
        actPrompts={{}}
        messages={[{ seq: 1, turn: 1, from: "cog1", to: "cog0", text: "hi cog0" }]}
      />,
    );
    expect(container.querySelectorAll("polygon")).toHaveLength(127);
    expect(getByTestId("cog-view")).toBeTruthy();
    expect(getByTestId("inbox").textContent).toContain("hi cog0");
  });
});
