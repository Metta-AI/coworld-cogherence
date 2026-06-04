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
  it("breaks largest-pile ties toward the earlier mineral in canonical order", () => {
    // O and Ge tie at the max; O precedes Ge, so O is spent first.
    expect(chargeEnergy(T(0, 1, 1, 0), 1)).toEqual(T(0, 0, 1, 0));
  });
  it("returns null when unaffordable only after a set is burned", () => {
    // need 14: burn the one set (granted 10), then no singles remain → null.
    expect(chargeEnergy(T(1, 1, 1, 1), 14)).toBeNull();
  });
  it("pulls trailing singles from the largest piles in the mixed regime", () => {
    // burn one set to (2,2,1,1), then 2 singles come off the two largest (C, O).
    expect(chargeEnergy(T(3, 3, 2, 2), 12)).toEqual(T(1, 1, 1, 1));
  });
  it("treats need = 0 as a no-op copy", () => {
    expect(chargeEnergy(T(1, 1, 1, 1), 0)).toEqual(T(1, 1, 1, 1));
  });
});
