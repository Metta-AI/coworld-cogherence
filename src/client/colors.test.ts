import { describe, it, expect } from "vitest";
import { cogColor, cogName } from "./colors";

describe("cogColor", () => {
  it("is stable per index and wraps the palette", () => {
    expect(cogColor(0)).toBe(cogColor(0));
    expect(cogColor(0)).toBe(cogColor(6)); // 6-color palette wraps
  });
});

describe("cogName", () => {
  it("names the first four cogs Alice, Bob, Carol, David", () => {
    expect(cogName(0)).toBe("Alice");
    expect(cogName(1)).toBe("Bob");
    expect(cogName(2)).toBe("Carol");
    expect(cogName(3)).toBe("David");
  });

  it("covers the full 3-6 cog range", () => {
    expect(cogName(4)).toBe("Erin");
    expect(cogName(5)).toBe("Frank");
  });

  it("falls back to a stable label beyond the named roster", () => {
    expect(cogName(6)).toBe("Cog 7");
  });
});
