import { createServer } from 'node:net';
import { chromium, expect, test } from '@playwright/test';
import lighthouse from 'lighthouse';

// Lighthouse budgets from the roadmap, on representative pages of the fixtures build. Uses the
// default mobile profile (slow 4G, mid-range phone), which is the stricter of the two.
const BUDGETS = { accessibility: 1, seo: 1, performance: 0.95, 'best-practices': 1 };
const PAGES = ['/', '/blog/hola-mundo/', '/en/blog/hello-world/', '/tags/', '/en/blog/'];

// Test builds always carry `noindex` (only the deploy workflow builds for production), so the
// crawlability audit is expected to fail here and is checked on the live site instead.
const SKIPPED_AUDITS = ['is-crawlable'];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('No port'));
      });
    });
  });
}

test('representative pages meet the Lighthouse budgets', async ({ baseURL }) => {
  test.setTimeout(240_000);
  const port = await freePort();
  // Lighthouse drives its own tab over the DevTools protocol of a Playwright-managed Chromium.
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
  try {
    for (const path of PAGES) {
      const result = await lighthouse(new URL(path, baseURL).href, {
        port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: Object.keys(BUDGETS),
        skipAudits: SKIPPED_AUDITS,
      });
      const categories = result?.lhr.categories ?? {};
      for (const [id, minimum] of Object.entries(BUDGETS)) {
        const category = categories[id];
        const failing = Object.values(result?.lhr.audits ?? {})
          .filter(
            (audit) =>
              category?.auditRefs.some((ref) => ref.id === audit.id && ref.weight > 0) &&
              audit.score !== null &&
              audit.score < 1,
          )
          .map((audit) => `${audit.id} (${audit.displayValue ?? audit.score})`);
        expect
          .soft(category?.score ?? 0, `${id} on ${path}: ${failing.join(', ') || 'no details'}`)
          .toBeGreaterThanOrEqual(minimum);
      }
    }
  } finally {
    await browser.close();
  }
});
