// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { HexBoard } from "./HexBoard";
import { toSnapshot } from "../shared/snapshot";
import { newGame } from "../shared/engine/game";
import type { GameSnapshot } from "../shared/snapshot";

const polyHeight = (poly: Element): number => {
  const ys = (poly.getAttribute("points") ?? "").split(" ").map((p) => Number(p.split(",")[1]));
  return Math.max(...ys) - Math.min(...ys);
};

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
  it("marks every tile with its mineral gem icon", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    const gems = [...container.querySelectorAll("image.tile-mineral")];
    expect(gems).toHaveLength(127);
    expect(gems.every((g) => ["C", "O", "Ge", "S"].includes(g.getAttribute("data-mineral") ?? ""))).toBe(true);
    expect(gems.every((g) => /icons\/transparent\/mineral-(c|o|ge|s)\.png$/.test(g.getAttribute("href") ?? ""))).toBe(true);
  });
  it("does not print coherence numbers on tiles (coherence shows via brightness)", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    expect(container.querySelectorAll(".tile-coherence")).toHaveLength(0);
    expect(container.querySelectorAll(".tile-mineral")).toHaveLength(127); // exactly one gem per tile
  });
  it("sizes the mineral gem bigger for denser tiles (and the hex stays uniform)", () => {
    const snapshot: GameSnapshot = {
      version: "0", seed: 7, turn: 1, phase: "negotiate", radius: 6, coherenceMax: 10, commons: 0, cogs: [],
      tiles: [
        { q: 0, r: 0, alignment: null, coherence: 0, mineral: "C", density: 1 },
        { q: 2, r: 0, alignment: null, coherence: 0, mineral: "C", density: 3 },
      ],
    };
    const { container } = render(<HexBoard snapshot={snapshot} />);
    const gems = [...container.querySelectorAll("image.tile-mineral")];
    const w = (g: Element) => Number(g.getAttribute("width"));
    expect(w(gems[1]!)).toBeGreaterThan(w(gems[0]!)); // density 3 gem larger than density 1
    // hexes are uniform now (no taller-tile treatment): equal polygon heights
    const polys = [...container.querySelectorAll("polygon")];
    expect(polyHeight(polys[1]!)).toBeCloseTo(polyHeight(polys[0]!), 5);
  });
  it("brightens tiles by coherence (full-coherence home > zero-coherence neutral)", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    const polys = [...container.querySelectorAll("polygon")];
    const owned = polys.find((p) => p.getAttribute("fill") !== "var(--neutral)")!;
    const neutral = polys.find((p) => p.getAttribute("fill") === "var(--neutral)")!;
    expect(Number(owned.getAttribute("fill-opacity"))).toBe(1); // coherence 10/10
    expect(Number(neutral.getAttribute("fill-opacity"))).toBe(0.2); // coherence 0/10
  });
  it("shows the tile detail card only on hover, anchored at the cursor", () => {
    const { container, getByTestId, queryByTestId } = render(<HexBoard snapshot={snap} />);
    expect(queryByTestId("tile-tip")).toBeNull(); // nothing until you hover (no fixed box)
    const owned = [...container.querySelectorAll("polygon")].find((p) => p.getAttribute("fill") !== "var(--neutral)")!;
    fireEvent.mouseMove(owned.parentElement!, { clientX: 40, clientY: 30 });
    const tip = getByTestId("tile-tip");
    expect(tip.textContent).toMatch(/mining/);
    expect(tip.textContent).toMatch(/upkeep/);
    expect(tip.textContent).toMatch(/\/turn/);
    // anchored at the cursor via inline left/top (not pinned to a fixed slot)
    expect((tip as HTMLElement).style.left).not.toBe("");
    expect((tip as HTMLElement).style.top).not.toBe("");
    fireEvent.mouseLeave(container.querySelector(".board-wrap")!);
    expect(queryByTestId("tile-tip")).toBeNull(); // and disappears when you leave
  });
  it("rings exactly the externally highlighted tile (cross-highlight from the feed)", () => {
    const lit = render(<HexBoard snapshot={snap} highlightKey="0,0" />); // center tile always exists
    expect(lit.container.querySelectorAll("polygon.tile-xhighlight")).toHaveLength(1);
    const none = render(<HexBoard snapshot={snap} highlightKey={null} />);
    expect(none.container.querySelectorAll("polygon.tile-xhighlight")).toHaveLength(0);
  });
});
