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
    expect(getByTestId("roster-cog0").textContent).toContain("1 tiles");
  });

  it("shows hearts, the COGS wallet, and a luminous sigil per cog", () => {
    const { getByTestId } = render(<Roster snapshot={snapshot()} />);
    const row = getByTestId("roster-cog0");
    const text = row.textContent ?? "";
    expect(text).toContain("Ge"); // a mineral chip
    expect(text).toContain("S"); // the COGS wallet
    expect(text).toContain("100"); // starting energy is derived from a full COGS set
    expect(row.querySelectorAll("svg").length).toBeGreaterThan(0); // the cog sigil
  });
});
