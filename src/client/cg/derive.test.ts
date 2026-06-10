import { describe, it, expect } from "vitest";
import { heartSpend } from "./derive";
import type { StampedEvent } from "../net/feed";

const auction = (turn: number, winner: string | null, price: number): StampedEvent => ({
  turn,
  event: { type: "auction", winner, price, bids: winner ? [[winner, price + 1]] : [] },
});

describe("heartSpend", () => {
  const events: StampedEvent[] = [
    auction(1, "cog0", 5),
    auction(2, "cog1", 3),
    auction(3, null, 0), // unsold — nothing charged
    auction(4, "cog0", 7),
  ];

  it("sums the clearing prices actually charged, total and per cog", () => {
    const s = heartSpend(events, 4);
    expect(s.total).toBe(15);
    expect(s.byCog.get("cog0")).toBe(12);
    expect(s.byCog.get("cog1")).toBe(3);
  });

  it("only counts auctions up to the given turn (scrubber-synced)", () => {
    const s = heartSpend(events, 2);
    expect(s.total).toBe(8);
    expect(s.byCog.get("cog0")).toBe(5);
  });

  it("is zero before anything resolves", () => {
    expect(heartSpend(events, 0).total).toBe(0);
  });
});
