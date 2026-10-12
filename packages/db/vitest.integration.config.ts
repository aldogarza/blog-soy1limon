import { defineProject } from 'vitest/config';

// Runs against the local Supabase stack (`pnpm db:start`). Files share one database, so run serially.
export default defineProject({
  test: {
    name: 'db-integration',
    include: ['src/**/*.integration.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
