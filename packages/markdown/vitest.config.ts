import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'markdown',
    include: ['src/**/*.test.ts'],
    // The first Markdown render loads Shiki (themes + WebAssembly regex engine): a few seconds on
    // small CI runners, which the default 5 s timeout does not cover.
    testTimeout: 30_000,
  },
});
