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

  it("renders the lattice, the identity panel, and the cog's readable channels", () => {
    const { container, getByTestId } = render(
      <CogView
        snapshot={snap}
        cogId="cog0"
        actPrompts={{}}
        messages={[{ seq: 1, turn: 1, from: "cog1", to: "cog0", text: "hi cog0" }]}
        events={[]}
      />,
    );
    expect(container.querySelectorAll("g.cg-tile")).toHaveLength(127);
    expect(getByTestId("cog-view")).toBeTruthy();
    expect(getByTestId("identity").textContent).toContain("Alice");
    expect(getByTestId("cog-channels").textContent).toContain("hi Alice"); // ids in text render as names
  });

  it("hides the operator steering panel in replay mode, shows it when live", () => {
    const replay = render(<CogView snapshot={snap} cogId="cog0" actPrompts={{}} messages={[]} events={[]} />);
    expect(replay.queryByTestId("steering")).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ persona: "", paused: false }) } as Response)),
    );
    const live = render(<CogView snapshot={snap} cogId="cog0" actPrompts={{}} messages={[]} events={[]} live />);
    expect(live.getByTestId("steering")).toBeTruthy();
  });
});
