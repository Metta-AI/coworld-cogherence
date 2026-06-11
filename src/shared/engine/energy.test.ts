import { describe, it, expect } from "vitest";
import { fullSets, convertSets } from "./energy";
import type { Treasury } from "./types";

const T = (C = 0, O = 0, Ge = 0, S = 0): Treasury => ({ C, O, Ge, S });

describe("fullSets", () => {
  it("limited by the scarcest mineral", () => {
    expect(fullSets(T(1, 1, 1, 1))).toBe(1);
    expect(fullSets(T(3, 2, 5, 2))).toBe(2);
    expect(fullSets(T(3, 0, 5, 9))).toBe(0);
  });
});

describe("convertSets", () => {
  it("burns one of each mineral per set for SET_ENERGY each", () => {
    expect(convertSets(T(2, 2, 2, 2), 1)).toEqual({ treasury: T(1, 1, 1, 1), gained: 10 });
    expect(convertSets(T(3, 2, 5, 2), 2)).toEqual({ treasury: T(1, 0, 3, 0), gained: 20 });
  });
  it("refuses when the treasury can't cover it — singles have no energy value", () => {
    expect(convertSets(T(9, 9, 9, 0), 1)).toBeNull();
    expect(convertSets(T(1, 1, 1, 1), 2)).toBeNull();
    expect(convertSets(T(1, 1, 1, 1), 0)).toBeNull();
  });
  it("does not mutate the input", () => {
    const t = T(2, 2, 2, 2);
    convertSets(t, 1);
    expect(t).toEqual(T(2, 2, 2, 2));
  });
});
