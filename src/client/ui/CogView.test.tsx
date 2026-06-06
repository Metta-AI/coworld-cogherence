// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { CogView } from "./CogView";
import { toSnapshot } from "../../shared/snapshot";
import { newGame } from "../../shared/engine/game";

describe("CogView", () => {
  const snap = toSnapshot(newGame(7, 4));
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("hides the operator steering panel in replay mode, shows it when live", () => {
    const replay = render(<CogView snapshot={snap} cogId="cog0" actPrompts={{}} messages={[]} />);
    expect(replay.queryByTestId("steering")).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ persona: "", paused: false }) } as Response)),
    );
    const live = render(<CogView snapshot={snap} cogId="cog0" actPrompts={{}} messages={[]} live />);
    expect(live.getByTestId("steering")).toBeTruthy();
  });
});
