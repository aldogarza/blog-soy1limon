import { defineConfig } from 'vitest/config';

// Integration suites need the local Supabase stack (`pnpm db:start`); `pnpm test` stays offline.
export default defineConfig({
  test: {
    projects: ['packages/db/vitest.integration.config.ts'],
  },
});
