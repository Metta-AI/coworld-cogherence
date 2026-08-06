// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CogView } from "./CogView";
import { toSnapshot } from "../../shared/snapshot";
import { newGame } from "../../shared/engine/game";

describe("CogView", () => {
  const snap = toSnapshot(newGame(7, 4));

  it("renders the lattice, the identity panel, and the cog's readable channels", () => {
    const { container, getByTestId } = render(
      <CogView
        snapshot={snap}
        cogId="cog0"
        messages={[{ seq: 1, turn: 1, from: "cog1", to: "cog0", text: "hi cog0" }]}
        events={[]}
      />,
    );
    expect(container.querySelectorAll("g.cg-tile")).toHaveLength(127);
    expect(getByTestId("cog-view")).toBeTruthy();
    expect(getByTestId("identity").textContent).toContain("Alice");
    expect(getByTestId("cog-channels").textContent).toContain("hi Alice"); // ids in text render as names
  });

  it("hides the autopilot panel in replay mode, shows it when live with a send channel", () => {
    const replay = render(<CogView snapshot={snap} cogId="cog0" messages={[]} events={[]} />);
    expect(replay.queryByTestId("autopilot")).toBeNull();

    const live = render(<CogView snapshot={snap} cogId="cog0" messages={[]} events={[]} live send={() => {}} />);
    expect(live.getByTestId("autopilot")).toBeTruthy();
  });
});
