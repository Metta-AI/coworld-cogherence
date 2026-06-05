// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Roster } from "./Roster";
import { toSnapshot } from "../shared/snapshot";
import { newGame } from "../shared/engine/game";

const snapshot = () => toSnapshot(newGame(7, 4));

describe("Roster", () => {
  it("lists every cog by its display name", () => {
    const { getByTestId } = render(<Roster snapshot={snapshot()} />);
    for (const name of ["Alice", "Bob", "Carol", "David"]) {
      expect(getByTestId("roster").textContent).toContain(name);
    }
  });

  it("shows each cog's territory (tiles aligned to it)", () => {
    const { getByTestId } = render(<Roster snapshot={snapshot()} />);
    // At turn 1 each cog holds exactly its one home tile.
    expect(getByTestId("roster-cog0").textContent).toContain("Alice");
    expect(getByTestId("roster-cog0").textContent).toContain("1");
  });
});
