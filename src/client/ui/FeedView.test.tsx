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
  it("shows an empty state", () => {
    const { getByText } = render(<FeedView messages={[]} />);
    expect(getByText(/haven't spoken/)).toBeTruthy();
  });
});
