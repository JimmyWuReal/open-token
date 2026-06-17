import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  optimizeDeps: {
    noDiscovery: true,
  },
  publicDir: command === "build" ? false : "public",
}));
