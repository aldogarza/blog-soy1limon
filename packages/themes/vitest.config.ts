import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'themes',
    include: ['src/**/*.test.ts'],
  },
});
