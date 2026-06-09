import { defineConfig } from "@playwright/test";

// Smoke tests run against the live server (express + ws) serving the built
// client; `preserve` regenerates public/replay.json and rebuilds dist/ first.
export default defineConfig({
  testDir: "tests/smoke",
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: "npm run serve -- --port 4173 --pace 400",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { baseURL: "http://localhost:4173" },
});
