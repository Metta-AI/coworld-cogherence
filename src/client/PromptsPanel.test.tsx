// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PromptsPanel } from "./PromptsPanel";

describe("PromptsPanel", () => {
  it("shows the latest prompt + decision per cog (by name)", () => {
    const { getByText, getByTestId } = render(
      <PromptsPanel
        actPrompts={{ cog0: [{ type: "actPrompt", cogId: "cog0", turn: 1, phase: "commit", content: "saw board -> bid 3" }] }}
      />,
    );
    expect(getByTestId("prompts")).toBeTruthy();
    expect(getByText(/saw board -> bid 3/)).toBeTruthy();
    expect(getByText(/Alice/)).toBeTruthy(); // cog0 -> Alice
  });
  it("renders an empty state when there are no prompts", () => {
    const { getByText } = render(<PromptsPanel actPrompts={{}} />);
    expect(getByText(/No model decisions yet/)).toBeTruthy();
  });
});
