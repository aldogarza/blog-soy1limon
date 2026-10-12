import { defineConfig, devices } from '@playwright/test';

// Builds the site from the offline fixtures and serves the static output, exactly what GitHub
// Pages would serve. No database or secrets involved.
const PORT = 4330;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A tiny GitHub-Pages-like static server (e2e/serve.mjs); `exec` lets Playwright stop it.
    command: `pnpm build && exec node e2e/serve.mjs dist ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { CONTENT_SOURCE: 'fixtures', SITE_URL: baseURL },
  },
});
