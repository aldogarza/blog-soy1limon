import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'media',
    include: ['src/**/*.test.ts'],
    // Image encoding and the exiftool child process are slower than plain unit tests.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
