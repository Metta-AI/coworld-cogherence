// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
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
  it("labels every tile with the mineral it provides", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    const minerals = [...container.querySelectorAll(".tile-mineral")];
    expect(minerals).toHaveLength(127);
    expect(minerals.every((m) => ["C", "O", "Ge", "S"].includes(m.textContent ?? ""))).toBe(true);
  });
  it("does not print coherence numbers on tiles (only the mineral letter)", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    expect(container.querySelectorAll(".tile-coherence")).toHaveLength(0); // coherence shows via brightness, not text
    expect(container.querySelectorAll(".tile-mineral")).toHaveLength(127); // exactly one label per tile
  });
  it("brightens tiles by coherence (full-coherence home > zero-coherence neutral)", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    const polys = [...container.querySelectorAll("polygon")];
    const owned = polys.find((p) => p.getAttribute("fill") !== "var(--neutral)")!;
    const neutral = polys.find((p) => p.getAttribute("fill") === "var(--neutral)")!;
    expect(Number(owned.getAttribute("fill-opacity"))).toBe(1); // coherence 10/10
    expect(Number(neutral.getAttribute("fill-opacity"))).toBe(0.2); // coherence 0/10
  });
  it("shows tile details on hover (owner, mining, upkeep)", () => {
    const { container, getByTestId } = render(<HexBoard snapshot={snap} />);
    expect(getByTestId("tile-tip").textContent).toMatch(/hover a tile/);
    const owned = [...container.querySelectorAll("polygon")].find((p) => p.getAttribute("fill") !== "var(--neutral)")!;
    fireEvent.mouseEnter(owned.parentElement!);
    const tip = getByTestId("tile-tip").textContent ?? "";
    expect(tip).toMatch(/mining/);
    expect(tip).toMatch(/upkeep/);
    expect(tip).toMatch(/\/turn/);
  });
});
