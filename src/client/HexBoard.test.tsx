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
  it("labels every tile with a 0–10 coherence score", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    const scores = [...container.querySelectorAll(".tile-coherence")];
    expect(scores).toHaveLength(127);
    expect(scores.every((s) => Number(s.textContent) >= 0 && Number(s.textContent) <= 10)).toBe(true);
    // Home tiles start at full coherence (COHERENCE_MAX) -> a perfect 10.
    expect(scores.some((s) => s.textContent === "10")).toBe(true);
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
