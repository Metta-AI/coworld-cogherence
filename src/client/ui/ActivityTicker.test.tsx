// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ActivityTicker } from "./ActivityTicker";
import { cogColor } from "../colors";
import type { StampedEvent } from "../net/feed";

const cap = (turn: number, tile: string): StampedEvent => ({
  turn,
  event: { type: "capture", tile, from: null, to: "cog0", coherence: 3 },
});

describe("ActivityTicker", () => {
  it("groups events under one header per turn, newest turn first", () => {
    const { container } = render(<ActivityTicker events={[cap(1, "0,0"), cap(1, "1,0"), cap(2, "2,0")]} />);
    const heads = [...container.querySelectorAll(".ev-turn-head")];
    expect(heads.map((h) => h.textContent)).toEqual(["Turn 2", "Turn 1"]); // newest turn first
    const groups = [...container.querySelectorAll(".ev-group")];
    expect(groups[1]!.querySelectorAll("li.ev")).toHaveLength(2); // both turn-1 captures grouped
  });

  it("renders the cog name in its color and reports the named cell on hover", () => {
    const seen: (string | null)[] = [];
    const { container } = render(<ActivityTicker events={[cap(1, "3,4")]} onHoverTile={(k) => seen.push(k)} />);

    const cog = container.querySelector(".ev-cog") as HTMLElement;
    expect(cog.textContent).toBe("Alice"); // cog0 -> Alice
    // jsdom normalizes the hex color to rgb(); just assert it matches cog0's color.
    const tmp = document.createElement("span");
    tmp.style.color = cogColor(0);
    expect(cog.style.color).toBe(tmp.style.color);

    const row = container.querySelector("li.ev.has-tile")!;
    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);
    expect(seen).toEqual(["3,4", null]); // hovers the cell, clears on leave
  });

  it("drops mint events and shows an empty state otherwise", () => {
    const mintOnly: StampedEvent[] = [{ turn: 1, event: { type: "mint", cog: "cog0", gained: { C: 1, O: 0, Ge: 0, S: 0 } } }];
    const { getByText, container } = render(<ActivityTicker events={mintOnly} />);
    expect(getByText("No events yet.")).toBeTruthy();
    expect(container.querySelectorAll("li.ev")).toHaveLength(0);
  });
});
