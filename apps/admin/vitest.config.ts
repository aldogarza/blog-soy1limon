import { defineProject } from 'vitest/config';

// Unit tests for the admin's plain TypeScript modules; browser flows live in e2e/ (Playwright).
export default defineProject({
  test: {
    name: 'admin',
    include: ['src/**/*.test.ts'],
  },
});
