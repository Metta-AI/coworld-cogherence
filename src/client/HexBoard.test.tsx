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

  it("zooms with the wheel, pans by dragging, and resets on double-click", () => {
    const { container } = render(<HexBoard snapshot={snap} />);
    const svg = container.querySelector("svg")!;
    const fit = svg.getAttribute("viewBox")!;
    const width = (vb: string): number => Number(vb.split(" ")[2]);

    fireEvent.wheel(svg, { deltaY: 400 }); // wheel/swipe down → zoom in
    const zoomed = svg.getAttribute("viewBox")!;
    expect(width(zoomed)).toBeLessThan(width(fit));

    // jsdom has no PointerEvent — drive the pointer listeners with MouseEvents.
    fireEvent(svg, new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
    fireEvent(window, new MouseEvent("pointermove", { clientX: 60, clientY: 100 })); // drag left → view shifts right
    fireEvent(window, new MouseEvent("pointerup", {}));
    const panned = svg.getAttribute("viewBox")!;
    expect(panned).not.toBe(zoomed);
    expect(width(panned)).toBe(width(zoomed)); // panning keeps the zoom level

    fireEvent.doubleClick(svg);
    expect(svg.getAttribute("viewBox")).toBe(fit);
  });

  it("reports the hovered tile with cursor coords, and null on leave", () => {
    const onHover = vi.fn();
    const { container } = render(<HexBoard snapshot={snap} onHoverTile={onHover} />);
    const tile = container.querySelector('g.cg-tile[data-tile="0,0"]')!;
    fireEvent.mouseEnter(tile, { clientX: 40, clientY: 30 });
    expect(onHover).toHaveBeenCalledWith("0,0", { x: 40, y: 30 });
    fireEvent.mouseLeave(container.querySelector("svg")!);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });
});
