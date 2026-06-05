// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Legend } from "./Legend";

describe("Legend", () => {
  it("documents the three board-verb icons", () => {
    const { container, getByTestId } = render(<Legend />);
    const text = getByTestId("legend").textContent ?? "";
    for (const verb of ["Align", "Exploit", "Deal"]) expect(text).toContain(verb);
    for (const name of ["align", "exploit", "deal"]) {
      expect(container.querySelector(`img[src$="${name}.png"]`)).not.toBeNull();
    }
  });

  it("shows the resource and mineral glyphs", () => {
    const { container } = render(<Legend />);
    for (const name of ["heart", "energy", "coherence", "mineral-c", "mineral-o", "mineral-ge", "mineral-s"]) {
      expect(container.querySelector(`img[src$="${name}.png"]`)).not.toBeNull();
    }
  });
});
