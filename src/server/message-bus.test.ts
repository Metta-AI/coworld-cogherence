import { describe, it, expect, vi } from "vitest";
import { MessageBus } from "./message-bus";

describe("MessageBus", () => {
  it("stamps a monotonic seq, records, and notifies", () => {
    const bus = new MessageBus();
    const fn = vi.fn();
    bus.onPost(fn);
    const m = bus.post("cog0", "public", "hello", 1);
    expect(m.seq).toBe(1);
    expect(fn).toHaveBeenCalledWith(m);
    expect(bus.recent()).toHaveLength(1);
  });
  it("redacts DMs in visibleTo (public + own sent/received)", () => {
    const bus = new MessageBus();
    bus.post("cog0", "public", "all", 1);
    bus.post("cog0", "cog1", "secret to 1", 1);
    bus.post("cog2", "cog3", "secret to 3", 1);
    expect(bus.visibleTo("cog1").map((m) => m.text)).toEqual(["all", "secret to 1"]);
    expect(bus.visibleTo("cog0").map((m) => m.text)).toEqual(["all", "secret to 1"]); // sender sees own DM
    expect(bus.visibleTo("cog4").map((m) => m.text)).toEqual(["all"]); // only public
  });
});
