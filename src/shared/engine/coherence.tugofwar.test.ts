import { describe, it, expect } from "vitest";
import { resolveTile } from "./coherence";

describe("resolveTile", () => {
  // LOCKED examples from the design
  it("A 5 vs B 3 on neutral -> A at 2", () =>
    expect(resolveTile(null, 0, [["A", 5], ["B", 3]])).toEqual({ alignment: "A", coherence: 2 }));
  it("incumbent A coh4, B attacks 3, A silent -> A holds at 1", () =>
    expect(resolveTile("A", 4, [["B", 3]])).toEqual({ alignment: "A", coherence: 1 }));
  it("incumbent A coh4, B attacks 5 -> flips to B at 1", () =>
    expect(resolveTile("A", 4, [["B", 5]])).toEqual({ alignment: "B", coherence: 1 }));
  it("reinforce own tile adds, capped at MAX (10)", () =>
    expect(resolveTile("A", 7, [["A", 6]])).toEqual({ alignment: "A", coherence: 10 }));
  it("tie -> neutral 0", () =>
    expect(resolveTile(null, 0, [["A", 3], ["B", 3]])).toEqual({ alignment: null, coherence: 0 }));

  // robustness
  it("no orders on a held tile -> unchanged", () =>
    expect(resolveTile("A", 4, [])).toEqual({ alignment: "A", coherence: 4 }));
  it("no orders on neutral -> stays neutral 0", () =>
    expect(resolveTile(null, 0, [])).toEqual({ alignment: null, coherence: 0 }));
  it("three-way: highest wins, margin is over the runner-up", () =>
    // forces A=2 (incumbent coh), B=5, C=3 -> B wins at 5-3=2
    expect(resolveTile("A", 2, [["B", 5], ["C", 3]])).toEqual({ alignment: "B", coherence: 2 }));
  it("incumbent reinforces while attacked: energy sums per alignment", () =>
    // A defends 3 + reinforces 2 = 5; B attacks 4 -> A holds at 5-4=1
    expect(resolveTile("A", 3, [["A", 2], ["B", 4]])).toEqual({ alignment: "A", coherence: 1 }));
  it("a tile at coherence 0 flips to a single attacker", () =>
    expect(resolveTile("A", 0, [["B", 3]])).toEqual({ alignment: "B", coherence: 3 }));
  it("tie among top attackers -> mutual annihilation to neutral 0", () =>
    expect(resolveTile("A", 0, [["B", 3], ["C", 3]])).toEqual({ alignment: null, coherence: 0 }));
  it("incumbent's defending force participates in a tie -> neutral 0", () =>
    expect(resolveTile("A", 3, [["B", 3]])).toEqual({ alignment: null, coherence: 0 }));
  it("two attackers tie strictly above a defending incumbent -> neutral 0", () =>
    expect(resolveTile("A", 2, [["B", 5], ["C", 5]])).toEqual({ alignment: null, coherence: 0 }));
});
