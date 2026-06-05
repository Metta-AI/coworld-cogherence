import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Vite config for the spectator client. Multi-entry per-cog views arrive in phase 3.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  plugins: [react()],
  build: { outDir: "dist", rollupOptions: { input: { main: resolve(__dirname, "index.html") } } },
}));
