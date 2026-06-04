import { describe, it, expect } from "vitest";
import { key, neighbors, hexesInRadius } from "./hex";

describe("hex", () => {
  it("keys a hex", () => expect(key({ q: 1, r: -2 })).toBe("1,-2"));
  it("has 6 neighbors", () => expect(neighbors({ q: 0, r: 0 })).toHaveLength(6));
  it("radius 0 = 1 tile, radius 1 = 7, radius 6 = 127", () => {
    expect(hexesInRadius(0)).toHaveLength(1);
    expect(hexesInRadius(1)).toHaveLength(7);
    expect(hexesInRadius(6)).toHaveLength(127);
  });
});
