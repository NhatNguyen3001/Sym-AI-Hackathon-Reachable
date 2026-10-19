import { defineConfig } from "@playwright/test";

// The showcase build (NEXT_PUBLIC_SHOWCASE=1) on its own port, with no API at all. Recordings come from
// tests/showcase/fixtures.ts unless SHOWCASE_REAL=1, which uses the real files in public/showcase/.
const WEB_PORT = 3200;

export default defineConfig({
  testDir: "tests/showcase",
  workers: 1,
  timeout: 60_000,
  // A visitor far from Sydney: times must still read as Sydney time, and nothing may say "ago".
  use: { baseURL: `http://localhost:${WEB_PORT}`, timezoneId: "Europe/London", permissions: [] },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    // Its own build folder, so it never mixes with the live build used by `npm run e2e`.
    command: `npx next build && npx next start -p ${WEB_PORT}`,
    url: `http://localhost:${WEB_PORT}`,
    env: { NEXT_PUBLIC_SHOWCASE: "1", NEXT_DIST_DIR: ".next-showcase" },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
