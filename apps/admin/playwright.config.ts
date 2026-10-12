import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run the built admin against the LOCAL Supabase stack and a throwaway media
// folder. They refuse to start if `supabase status` points anywhere but localhost.

const repoRoot = join(import.meta.dirname, '..', '..');
const status = Object.fromEntries(
  execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
    .filter((match) => match !== null)
    .map((match) => [match[1], match[2]]),
);
const apiUrl = status.API_URL ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(apiUrl)) {
  throw new Error(
    `E2E tests only run against the local Supabase stack, got "${apiUrl}". Run pnpm db:start.`,
  );
}

// A different port from the everyday admin (4322), so both can run at the same time.
const PORT = 4323;
const baseURL = `http://127.0.0.1:${PORT}`;
export const mediaRoot =
  process.env.E2E_MEDIA_ROOT ?? mkdtempSync(join(tmpdir(), 'soy1limon-e2e-'));
process.env.E2E_MEDIA_ROOT = mediaRoot;
process.env.E2E_SUPABASE_URL = apiUrl;
process.env.E2E_SUPABASE_SECRET_KEY = status.SECRET_KEY ?? '';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node dist/server/entry.mjs',
    url: baseURL,
    reuseExistingServer: false,
    env: {
      HOST: '127.0.0.1',
      PORT: String(PORT),
      SUPABASE_URL: apiUrl,
      SUPABASE_SECRET_KEY: status.SECRET_KEY ?? '',
      STORAGE_DRIVER: 'local-fs',
      MEDIA_BASE_URL: `${baseURL}/files`,
      LOCAL_MEDIA_ROOT: mediaRoot,
      // Empty values win over apps/admin/.env: tests must never trigger a real deploy.
      GITHUB_REPO: '',
      GITHUB_TOKEN: '',
    },
  },
});
