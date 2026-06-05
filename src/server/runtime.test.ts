import { describe, it, expect } from "vitest";
import { startServer } from "./runtime";
import { greedyAgent } from "../agents/stub";

describe("startServer", () => {
  it("listens and serves health, then closes", async () => {
    const h = await startServer({
      seed: 7,
      agents: [greedyAgent("cog0"), greedyAgent("cog1")],
      port: 0,
      autorun: false,
    });
    expect((await fetch(`${h.url}/health`)).status).toBe(200);
    await h.close();
  });
});
