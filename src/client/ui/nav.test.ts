import { describe, it, expect } from "vitest";
import { parseLocation, viewHref } from "./nav";

describe("nav", () => {
  it("parses global / feed / cog with ?live", () => {
    expect(parseLocation({ pathname: "/", search: "?live" })).toEqual({ view: "global", cogId: null, live: true });
    expect(parseLocation({ pathname: "/feed", search: "" })).toEqual({ view: "feed", cogId: null, live: false });
    expect(parseLocation({ pathname: "/cog/cog2", search: "?live" })).toEqual({ view: "cog", cogId: "cog2", live: true });
  });
  it("builds hrefs", () => {
    expect(viewHref("global", null, true)).toBe("/?live");
    expect(viewHref("feed", null, false)).toBe("/feed");
    expect(viewHref("cog", "cog1", true)).toBe("/cog/cog1?live");
  });
});
