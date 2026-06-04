import { describe, it, expect } from "vitest";
import { maxEnergy, chargeEnergy } from "./energy";
import type { Treasury } from "./types";

const T = (C = 0, O = 0, Ge = 0, S = 0): Treasury => ({ C, O, Ge, S });
const total = (t: Treasury) => t.C + t.O + t.Ge + t.S;

describe("maxEnergy", () => {
  it("one full set = 10", () => expect(maxEnergy(T(1, 1, 1, 1))).toBe(10));
  it("set + 2 singles = 12", () => expect(maxEnergy(T(2, 2, 1, 1))).toBe(12));
  it("only singles = 1 each", () => expect(maxEnergy(T(3, 0, 0, 0))).toBe(3));
  it("two full sets = 20", () => expect(maxEnergy(T(2, 2, 2, 2))).toBe(20));
});

describe("chargeEnergy", () => {
  // Minerals are lumpy: a COGS set converts all-or-nothing for 10. So a small
  // need is paid with singles, consuming exactly that many minerals — we assert
  // the count spent, not a leftover maxEnergy (which re-buckets unintuitively).
  it("covers a small need with singles, spending exactly that many minerals", () => {
    const r = chargeEnergy(T(2, 2, 2, 2), 3);
    expect(r).not.toBeNull();
    expect(total(r!)).toBe(total(T(2, 2, 2, 2)) - 3);
  });
  it("burns a full set for need == 10", () => {
    expect(chargeEnergy(T(2, 2, 2, 2), 10)).toEqual(T(1, 1, 1, 1));
  });
  it("uses a set + singles for a need between multiples of 10 (need 12 -> 6 minerals)", () => {
    const r = chargeEnergy(T(2, 2, 2, 2), 12);
    expect(r).not.toBeNull();
    expect(total(r!)).toBe(total(T(2, 2, 2, 2)) - 6);
  });
  it("spends from the largest pile first, preserving set-balance", () => {
    expect(chargeEnergy(T(3, 1, 1, 1), 2)).toEqual(T(1, 1, 1, 1));
  });
  it("returns null when unaffordable", () => {
    expect(chargeEnergy(T(1, 0, 0, 0), 5)).toBeNull();
  });
});
