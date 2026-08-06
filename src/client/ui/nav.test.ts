import { describe, it, expect } from "vitest";
import { parseLocation, viewHref, instancePrefix, liveFeedWsUrl, navUrl } from "./nav";

describe("nav", () => {
  it("parses global / feed / cog with ?live", () => {
    expect(parseLocation({ pathname: "/", search: "?live" })).toEqual({ view: "global", cogId: null, live: true });
    expect(parseLocation({ pathname: "/feed", search: "" })).toEqual({ view: "feed", cogId: null, live: false });
    expect(parseLocation({ pathname: "/cog/cog2", search: "?live" })).toEqual({ view: "cog", cogId: "cog2", live: true });
  });
  it("parses feed / cog under the cogweb hub instance prefix", () => {
    expect(parseLocation({ pathname: "/cogherence/ab12c/", search: "?live" })).toEqual({ view: "global", cogId: null, live: true });
    expect(parseLocation({ pathname: "/cogherence/ab12c/feed", search: "?live" })).toEqual({ view: "feed", cogId: null, live: true });
    expect(parseLocation({ pathname: "/cogherence/ab12c/cog/cog2", search: "?live" })).toEqual({ view: "cog", cogId: "cog2", live: true });
  });
  it("builds hrefs", () => {
    expect(viewHref("global", null, true)).toBe("/?live");
    expect(viewHref("feed", null, false)).toBe("/feed");
    expect(viewHref("cog", "cog1", true)).toBe("/cog/cog1?live");
  });
});

describe("instancePrefix", () => {
  it("is empty at the instance root (standalone + Coworld)", () => {
    expect(instancePrefix("/")).toBe("");
    expect(instancePrefix("/feed")).toBe("");
    expect(instancePrefix("/cog/cog0")).toBe("");
    expect(instancePrefix("/client/global")).toBe("");
    expect(instancePrefix("/client/player")).toBe("");
    expect(instancePrefix("/client/replay")).toBe("");
  });
  it("recovers the /<moduleId>/<instanceId> prefix under the cogweb hub", () => {
    expect(instancePrefix("/cogherence/ab12c/")).toBe("/cogherence/ab12c");
    expect(instancePrefix("/cogherence/ab12c")).toBe("/cogherence/ab12c");
    expect(instancePrefix("/cogherence/ab12c/feed")).toBe("/cogherence/ab12c");
    expect(instancePrefix("/cogherence/ab12c/cog/cog0")).toBe("/cogherence/ab12c");
  });
});

describe("liveFeedWsUrl", () => {
  const at = (pathname: string, protocol = "http:", host = "h") => ({ protocol, host, pathname });
  it("targets the @cogweb instance ws at the root (standalone)", () => {
    expect(liveFeedWsUrl(at("/"), "global", null)).toBe("ws://h/global/ws");
    expect(liveFeedWsUrl(at("/feed"), "feed", null)).toBe("ws://h/global/ws");
    expect(liveFeedWsUrl(at("/cog/cog0"), "cog", "cog0")).toBe("ws://h/cog/cog0/ws");
  });
  it("prefixes the ws with the instance path under the cogweb hub", () => {
    expect(liveFeedWsUrl(at("/cogherence/ab12c/"), "global", null)).toBe("ws://h/cogherence/ab12c/global/ws");
  });
  it("uses the Coworld host's strict ws paths for /client/* routes", () => {
    expect(liveFeedWsUrl(at("/client/global"), "global", null)).toBe("ws://h/global");
    expect(liveFeedWsUrl(at("/client/player"), "cog", "cog0")).toBe("ws://h/global"); // agent view spectates global
    expect(liveFeedWsUrl(at("/client/replay"), "global", null)).toBe("ws://h/replay");
  });
  it("uses wss on an https page (no mixed-content socket)", () => {
    expect(liveFeedWsUrl(at("/cogherence/ab12c/", "https:"), "global", null)).toBe("wss://h/cogherence/ab12c/global/ws");
  });
});

describe("navUrl", () => {
  it("is a bare absolute path at the instance root (standalone + Coworld)", () => {
    expect(navUrl({ pathname: "/", href: "http://h/?live" }, "cog", "cog0", true)).toBe("http://h/cog/cog0?live");
    expect(navUrl({ pathname: "/cog/cog1", href: "http://h/cog/cog1?live" }, "feed", null, true)).toBe("http://h/feed?live");
  });
  it("hangs off the /<moduleId>/<instanceId> prefix under the cogweb hub (no router-root 404)", () => {
    expect(navUrl({ pathname: "/cogherence/ab12c/", href: "http://h/cogherence/ab12c/" }, "cog", "cog0", true)).toBe(
      "http://h/cogherence/ab12c/cog/cog0?live",
    );
    // recovers the prefix even when already on an internal view (feed -> a cog)
    expect(navUrl({ pathname: "/cogherence/ab12c/feed", href: "http://h/cogherence/ab12c/feed?live" }, "cog", "cog2", true)).toBe(
      "http://h/cogherence/ab12c/cog/cog2?live",
    );
  });
});
