import { expect, type Page } from '@playwright/test';

/**
 * Every internal page reachable from the home pages, discovered by following links. The search
 * pages are opened from a form and page 2 of the archive by a button, so they are starting points.
 */
export async function crawl(page: Page): Promise<string[]> {
  const queue = ['/', '/en/', '/search/', '/en/search/', '/page/2/', '/en/page/2/'];
  const seen = new Set(queue);
  // for-of over an array also visits items pushed while iterating: a breadth-first crawl.
  for (const path of queue) {
    const response = await page.goto(path);
    expect(response?.status(), `status of ${path}`).toBe(200);
    // Redirect pages navigate away immediately; their target is crawled on its own.
    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
    for (const href of hrefs) {
      const url = new URL(href);
      if (url.origin !== new URL(page.url()).origin) continue;
      if (url.pathname.endsWith('.xml') || url.pathname.endsWith('.webp')) continue;
      if (!seen.has(url.pathname)) {
        seen.add(url.pathname);
        queue.push(url.pathname);
      }
    }
  }
  return queue;
}
