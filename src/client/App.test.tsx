// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the title", () => {
    const { getByText } = render(<App />);
    expect(getByText(/Cogherence/i)).toBeTruthy();
  });
});
