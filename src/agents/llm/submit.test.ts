import { describe, it, expect } from "vitest";
import { parseSubmit, SUBMIT_ORDERS_TOOL } from "./submit";
import { OrderSchema } from "../../shared/engine/orders";

describe("submit_orders", () => {
  it("converts a full payload to valid engine Order[]", () => {
    const orders = parseSubmit({
      aligns: [{ tile: "0,0", force: 5 }],
      exploits: ["1,0"],
      transfers: [{ to: "cog1", mineral: "S", amount: 2 }],
      bid: 3,
    });
    for (const o of orders) expect(() => OrderSchema.parse(o)).not.toThrow();
    expect(orders).toContainEqual({ type: "align", tile: "0,0", force: 5 });
    expect(orders).toContainEqual({ type: "exploit", tile: "1,0" });
    expect(orders).toContainEqual({ type: "transfer", to: "cog1", mineral: "S", amount: 2 });
    expect(orders).toContainEqual({ type: "bid", energy: 3 });
  });

  it("drops a zero/absent bid", () => {
    expect(parseSubmit({ bid: 0 })).toEqual([]);
    expect(parseSubmit({})).toEqual([]);
  });

  it("returns [] on malformed input (fail-safe)", () => {
    expect(parseSubmit({ aligns: [{ tile: "0,0", force: -1 }] })).toEqual([]);
    expect(parseSubmit("garbage")).toEqual([]);
    expect(parseSubmit(null)).toEqual([]);
  });

  it("exposes a JSON-Schema tool definition", () => {
    expect(SUBMIT_ORDERS_TOOL.name).toBe("submit_orders");
    expect((SUBMIT_ORDERS_TOOL.inputSchema as { type: string }).type).toBe("object");
  });
});
