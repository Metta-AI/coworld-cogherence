// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FeedView } from "./FeedView";

describe("FeedView", () => {
  it("renders public + DM messages with sender names", () => {
    const { getByText, getAllByText, getByTestId } = render(
      <FeedView
        messages={[
          { seq: 1, turn: 1, from: "cog0", to: "public", text: "alliance?" },
          { seq: 2, turn: 1, from: "cog1", to: "cog0", text: "deal" },
        ]}
      />,
    );
    expect(getByTestId("feed")).toBeTruthy();
    expect(getByText(/alliance\?/)).toBeTruthy();
    expect(getAllByText(/Alice/).length).toBeGreaterThan(0); // cog0 -> Alice
  });

  it("groups messages under one header per turn", () => {
    const { container, getAllByText } = render(
      <FeedView
        messages={[
          { seq: 1, turn: 1, from: "cog0", to: "public", text: "hi" },
          { seq: 2, turn: 1, from: "cog1", to: "public", text: "hey" },
          { seq: 3, turn: 2, from: "cog0", to: "public", text: "again" },
        ]}
      />,
    );
    const heads = [...container.querySelectorAll(".cg-feed-turn")];
    expect(heads.map((h) => h.textContent)).toEqual(["Turn 1", "Turn 2"]); // 2 turns -> 2 group headers
    expect(getAllByText(/^(hi|hey)$/).length).toBe(2); // both turn-1 messages under "Turn 1"
    expect(container.querySelectorAll(".cg-feed-group")).toHaveLength(2);
  });

  it("shows an empty state", () => {
    const { getByText } = render(<FeedView messages={[]} />);
    expect(getByText(/spoken/)).toBeTruthy();
  });
});
