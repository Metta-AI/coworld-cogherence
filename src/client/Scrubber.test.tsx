// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Scrubber } from "./Scrubber";

const base = {
  index: 3,
  count: 10,
  onSeek: () => {},
  playing: false,
  onTogglePlay: () => {},
};

describe("Scrubber", () => {
  it("shows the displayed turn via turnAt and a replay dot", () => {
    const { getByText, container } = render(<Scrubber {...base} turnAt={(i) => i + 1} />);
    expect(getByText("turn 4")).toBeTruthy(); // index 3 -> turn 4
    expect(container.querySelector(".scrub-dot.is-replay")).toBeTruthy();
  });

  it("renders a live dot when live", () => {
    const { container } = render(<Scrubber {...base} live />);
    expect(container.querySelector(".scrub-dot.is-live")).toBeTruthy();
  });

  it("jump-to-start seeks index 0; step forward seeks index+1", () => {
    const onSeek = vi.fn();
    const { getByLabelText } = render(<Scrubber {...base} onSeek={onSeek} />);
    fireEvent.click(getByLabelText("jump to start"));
    expect(onSeek).toHaveBeenCalledWith(0);
    fireEvent.click(getByLabelText("step forward"));
    expect(onSeek).toHaveBeenCalledWith(4);
  });

  it("renders per-turn markers (chat dots + capture count) from marks()", () => {
    const marks = (i: number) => (i === 2 ? { messages: 3, captures: 2 } : { messages: 0, captures: 0 });
    const { container } = render(<Scrubber {...base} marks={marks} />);
    expect(container.querySelectorAll(".scrub-mark")).toHaveLength(1);
    expect(container.querySelectorAll(".scrub-mark-dot")).toHaveLength(3);
    expect(container.querySelector(".scrub-mark-cap")!.textContent).toBe("⬡2");
  });

  it("toggles play/pause label", () => {
    const { getByLabelText, rerender } = render(<Scrubber {...base} playing={false} />);
    expect(getByLabelText("play")).toBeTruthy();
    rerender(<Scrubber {...base} playing />);
    expect(getByLabelText("pause")).toBeTruthy();
  });
});
