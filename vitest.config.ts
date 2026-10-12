import { defineConfig } from 'vitest/config';

// Each workspace package with its own vitest.config.ts becomes a test project.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
