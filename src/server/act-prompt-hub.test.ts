import { describe, it, expect, vi } from "vitest";
import { ActPromptHub } from "./act-prompt-hub";

describe("ActPromptHub", () => {
  it("records and lists recent entries per cog (bounded)", () => {
    const hub = new ActPromptHub(2); // cap 2
    hub.record({ cogId: "cog0", turn: 1, phase: "commit", content: "a" });
    hub.record({ cogId: "cog0", turn: 2, phase: "commit", content: "b" });
    hub.record({ cogId: "cog0", turn: 3, phase: "commit", content: "c" });
    expect(hub.list("cog0").map((e) => e.content)).toEqual(["b", "c"]); // oldest evicted
    expect(hub.list("cog1")).toEqual([]);
  });
  it("notifies subscribers on record", () => {
    const hub = new ActPromptHub();
    const fn = vi.fn();
    hub.onRecord(fn);
    hub.record({ cogId: "cog0", turn: 1, phase: "commit", content: "a" });
    expect(fn).toHaveBeenCalledWith({ cogId: "cog0", turn: 1, phase: "commit", content: "a" });
  });
  it("lists the cogs that have recorded", () => {
    const hub = new ActPromptHub();
    hub.record({ cogId: "cog0", turn: 1, phase: "commit", content: "a" });
    hub.record({ cogId: "cog2", turn: 1, phase: "commit", content: "b" });
    expect(hub.cogs().sort()).toEqual(["cog0", "cog2"]);
  });
});
