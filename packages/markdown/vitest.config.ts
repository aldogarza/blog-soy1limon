import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'markdown',
    include: ['src/**/*.test.ts'],
  },
});
