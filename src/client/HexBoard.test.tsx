// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HexBoard } from "./HexBoard";
import { toSnapshot } from "../shared/snapshot";
import { newGame } from "../shared/engine/game";

describe("HexBoard", () => {
  const snap = toSnapshot(newGame(7, 4));
  it("renders one polygon per tile", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    expect(container.querySelectorAll("polygon")).toHaveLength(127);
  });
  it("colors owned tiles by their cog", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    const filled = [...container.querySelectorAll("polygon")].filter((p) => p.getAttribute("fill") !== "var(--neutral)");
    expect(filled.length).toBeGreaterThan(0); // home tiles are owned
  });
});
