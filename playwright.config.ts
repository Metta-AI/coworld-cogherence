import { defineConfig } from "@playwright/test";

// Smoke tests run against the live server (express + ws) serving the client
// through Vite middleware — no build step; the port is up in ~2s.
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
