// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Hud } from "./Hud";
import { toSnapshot } from "../shared/snapshot";
import { newGame } from "../shared/engine/game";

const snapshot = () => toSnapshot(newGame(7, 4));

describe("Hud", () => {
  it("shows the turn and commons readout", () => {
    const { getByTestId } = render(<Hud snapshot={snapshot()} />);
    const text = getByTestId("turn-label").textContent ?? "";
    expect(text).toContain("Turn");
    expect(text).toContain("commons");
  });

  it("renders heart, energy, and coherence art icons", () => {
    const { container } = render(<Hud snapshot={snapshot()} />);
    for (const name of ["heart", "energy", "coherence"]) {
      expect(container.querySelector(`img[src$="${name}.png"]`)).not.toBeNull();
    }
  });

  it("renders an icon for each C/O/Ge/S mineral in the treasury", () => {
    const { container } = render(<Hud snapshot={snapshot()} />);
    for (const m of ["mineral-c", "mineral-o", "mineral-ge", "mineral-s"]) {
      expect(container.querySelector(`img[src$="${m}.png"]`)).not.toBeNull();
    }
  });
});
