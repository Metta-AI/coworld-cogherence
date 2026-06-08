// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { HexBoard } from "./HexBoard";
import { toSnapshot } from "../shared/snapshot";
import { newGame } from "../shared/engine/game";
import { cogColor } from "./colors";

describe("HexBoard", () => {
  const snap = toSnapshot(newGame(7, 4));

  it("renders one tile group per tile", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    expect(container.querySelectorAll("g.cg-tile")).toHaveLength(127);
  });

  it("colors owned tiles by their cog (one per home tile)", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    const cogFills = new Set(snap.cogs.map((c) => cogColor(c.index)));
    const owned = [...container.querySelectorAll("g.cg-tile > polygon")].filter((p) => cogFills.has(p.getAttribute("fill") ?? ""));
    expect(owned.length).toBe(snap.cogs.length); // each cog holds exactly its home tile at turn 1
  });

  it("prints no coherence digits in coherence mode (the glow reads it out)", () => {
    const { container } = render(<HexBoard snapshot={snap} mode="coherence" />);
    expect(container.querySelectorAll("text")).toHaveLength(0);
  });

  it("prints coherence digits in territory mode", () => {
    const { container } = render(<HexBoard snapshot={snap} mode="ownership" />);
    // home tiles are at coherence 10 (>= 40% of max) → a digit each
    expect(container.querySelectorAll("text").length).toBe(snap.cogs.length);
  });

  it("glows owned tiles and not neutral ones", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    const cogFills = new Set(snap.cogs.map((c) => cogColor(c.index)));
    const groups = [...container.querySelectorAll("g.cg-tile")];
    const owned = groups.find((g) => cogFills.has(g.querySelector("polygon")?.getAttribute("fill") ?? ""))!;
    const neutral = groups.find((g) => !cogFills.has(g.querySelector("polygon")?.getAttribute("fill") ?? ""))!;
    expect((owned as HTMLElement).style.filter).toContain("drop-shadow");
    expect((neutral as HTMLElement).style.filter).toBe("none");
  });

  it("fills tiles with mineral hues in mineral mode", () => {
    const { container } = render(<HexBoard snapshot={snap} mode="mineral" />);
    const mineralColors = new Set(["#b9f2ff", "#4d7cff", "#c061ff", "#ffc23c"]);
    const fills = [...container.querySelectorAll("g.cg-tile > polygon")].map((p) => p.getAttribute("fill"));
    expect(fills.every((f) => mineralColors.has(f ?? "") || f === "#15151f")).toBe(true); // mineral hue, or a scarred husk
  });

  it("selects a tile on click and rings it", () => {
    const onSelect = vi.fn();
    const { container, rerender } = render(<HexBoard snapshot={snap} onSelect={onSelect} />);
    const tile = container.querySelector('g.cg-tile[data-tile="0,0"]')!;
    fireEvent.click(tile);
    expect(onSelect).toHaveBeenCalledWith("0,0");
    rerender(<HexBoard snapshot={snap} onSelect={onSelect} selected="0,0" />);
    const ring = container.querySelector('g.cg-tile[data-tile="0,0"] polygon[stroke="#fff"]');
    expect(ring).toBeTruthy();
  });
});
