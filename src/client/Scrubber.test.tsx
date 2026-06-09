// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Scrubber } from "./Scrubber";
import type { GameSnapshot } from "../shared/snapshot";

const snaps = (n: number): GameSnapshot[] =>
  Array.from({ length: n }, (_, i) => ({
    version: "0",
    seed: 7,
    turn: i + 1,
    phase: "resolve",
    radius: 6,
    coherenceMax: 10,
    tiles: [{ q: 0, r: 0, alignment: "cog0", coherence: i, mineral: "C", density: 1 }],
    cogs: [{ id: "cog0", index: 0, hearts: i, treasury: { C: 0, O: 0, Ge: 0, S: 0 }, energy: 0 }],
  }));

const base = {
  snapshots: snaps(10),
  events: [],
  index: 3,
  onSeek: () => {},
  playing: false,
  onTogglePlay: () => {},
};

describe("Scrubber", () => {
  it("shows the displayed turn and a replay dot", () => {
    const { container } = render(<Scrubber {...base} />);
    expect(container.textContent).toContain("04"); // index 3 -> turn 4
    expect(container.querySelector(".cg-scrub-dot.is-replay")).toBeTruthy();
  });

  it("renders a live dot when live", () => {
    const { container } = render(<Scrubber {...base} live />);
    expect(container.querySelector(".cg-scrub-dot.is-live")).toBeTruthy();
  });

  it("always renders the dual-band overview", () => {
    const { getByTestId } = render(<Scrubber {...base} />);
    expect(getByTestId("scrub-overview")).toBeTruthy();
  });

  it("first seeks index 0; forward seeks index+1", () => {
    const onSeek = vi.fn();
    const { getByLabelText, unmount } = render(<Scrubber {...base} onSeek={onSeek} />);
    fireEvent.click(getByLabelText("First"));
    expect(onSeek).toHaveBeenCalledWith(0);
    fireEvent.click(getByLabelText("Forward"));
    expect(onSeek).toHaveBeenCalledWith(4);
    unmount();
  });

  it("clicking a detail-rail card seeks that turn", () => {
    const onSeek = vi.fn();
    const { container, unmount } = render(<Scrubber {...base} onSeek={onSeek} />);
    const cards = container.querySelectorAll(".cg-rail-card");
    expect(cards.length).toBeGreaterThan(0);
    fireEvent.click(cards[0]!);
    expect(onSeek).toHaveBeenCalled();
    unmount();
  });

  it("arrow keys step one turn back/forward, clamped to the range", () => {
    const onSeek = vi.fn();
    const mid = render(<Scrubber {...base} onSeek={onSeek} />); // index 3
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onSeek).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onSeek).toHaveBeenLastCalledWith(2); // 4 -> 3 -> 2 via the optimistic ref
    mid.unmount();

    const onSeekEnd = vi.fn();
    const end = render(<Scrubber {...base} index={9} onSeek={onSeekEnd} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onSeekEnd).toHaveBeenLastCalledWith(9); // already at last → clamps
    end.unmount();
  });

  it("arrow keys are ignored while typing in a field", () => {
    const onSeek = vi.fn();
    const { unmount } = render(<Scrubber {...base} onSeek={onSeek} />);
    const input = document.body.appendChild(document.createElement("input"));
    input.focus();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onSeek).not.toHaveBeenCalled();
    input.remove();
    unmount();
  });

  it("toggles play/pause label", () => {
    const { getByLabelText, rerender } = render(<Scrubber {...base} playing={false} />);
    expect(getByLabelText("Play")).toBeTruthy();
    rerender(<Scrubber {...base} playing />);
    expect(getByLabelText("Pause")).toBeTruthy();
  });
});
