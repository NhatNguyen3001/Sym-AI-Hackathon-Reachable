import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Runs the real API (fresh demo database, no Claude key) and a production build of the web app on their own ports.
const API_PORT = 8100;
const WEB_PORT = 3100;
// Fresh demo data for every run: each run gets its own SQLite file. Workers re-load this config and inherit
// E2E_RUN from the main process, so only the main process cleans up files from earlier runs.
const API_DIR = path.resolve(__dirname, "../api");
if (!process.env.E2E_RUN) {
  process.env.E2E_RUN = String(Date.now());
  for (const f of readdirSync(API_DIR).filter((f) => /^e2e.*\.db$/.test(f))) {
    try {
      rmSync(path.join(API_DIR, f));
    } catch {
      // still open from a crashed run; harmless
    }
  }
}
const DB = `e2e-${process.env.E2E_RUN}.db`;

const python = process.platform === "win32" ? String.raw`.venv\Scripts\python.exe` : ".venv/bin/python";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: `http://localhost:${WEB_PORT}` },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../api",
      url: `http://localhost:${API_PORT}/health`,
      env: {
        DATABASE_URL: `sqlite:///./${DB}`,
        ANTHROPIC_API_KEY: "",
        // Deterministic by default: campus graph, no live address search. E2E_VALHALLA=1 uses the real Sydney stack.
        ROUTER: process.env.E2E_VALHALLA ? "valhalla" : "campus",
        PHOTON_URL: process.env.E2E_VALHALLA ? "https://photon.komoot.io" : "",
        CORS_ORIGINS: `["http://localhost:${WEB_PORT}"]`,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run build && npx next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
