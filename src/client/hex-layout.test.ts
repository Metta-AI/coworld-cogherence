import { describe, it, expect } from "vitest";
import { axialToPixel, hexCorners, polygonPoints } from "./hex-layout";

describe("hex-layout", () => {
  it("centers the origin hex at (0,0)", () => expect(axialToPixel(0, 0, 10)).toEqual({ x: 0, y: 0 }));
  it("moving +r shifts down", () => expect(axialToPixel(0, 1, 10).y).toBeGreaterThan(0));
  it("a hex has 6 corners", () => expect(hexCorners(0, 0, 10)).toHaveLength(6));
  it("renders corners as an SVG points string", () =>
    expect(polygonPoints(hexCorners(0, 0, 10)).split(" ")).toHaveLength(6));
});
