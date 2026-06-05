import { defineConfig } from "@playwright/test";

// Smoke tests run against the built client served by `vite preview`.
// `presmoke` regenerates public/replay.json, which `build:web` copies into dist/.
export default defineConfig({
  testDir: "tests/smoke",
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: "npm run build:web && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { baseURL: "http://localhost:4173" },
});
