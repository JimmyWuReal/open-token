import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = process.env.OPEN_TOKEN_HOME || path.join(os.homedir(), ".open-token");
const outFile = path.join(dataDir, "token-events.json");

async function readLocalPayload() {
  const text = await fs.readFile(outFile, "utf8");
  return JSON.parse(text);
}

function localDataPlugin() {
  return {
    name: "open-token-local-data",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || "/", "http://127.0.0.1");
        if (url.pathname !== "/local-data/token-events.json" && url.pathname !== "/local-data/status.json") {
          next();
          return;
        }

        response.setHeader("content-type", "application/json; charset=utf-8");
        response.setHeader("cache-control", "no-store");

        try {
          const payload = await readLocalPayload();
          if (url.pathname === "/local-data/token-events.json") {
            response.end(JSON.stringify(payload));
            return;
          }

          response.end(JSON.stringify({
            state: "done",
            progress: 100,
            message: `Loaded ${payload.totalEvents || payload.events?.length || 0} dashboard events.`,
            rootsTotal: 0,
            rootsScanned: 0,
            filesDiscovered: 0,
            filesParsed: 0,
            eventsCollected: payload.totalEvents || payload.events?.length || 0,
            scannedPaths: payload.scannedPaths || [],
            totalEvents: payload.totalEvents || payload.events?.length || 0,
            generatedAt: payload.generatedAt,
            updatedAt: new Date().toISOString()
          }));
        } catch {
          response.statusCode = 404;
          response.end(JSON.stringify({ error: "Local Open Token data has not been collected yet." }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), localDataPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false
  }
});
