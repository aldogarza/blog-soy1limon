import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { crawl } from './crawl.ts';

// Automated part of the quality pass (docs/accessibility.md). Each test walks every page.

let pages: string[] = [];

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  pages = await crawl(page);
  await page.close();
});

/** Elements wider than the viewport, to explain a horizontal scroll bar. */
function overflowing(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((element) => element.getBoundingClientRect().right > width + 1)
      .map((element) => element.outerHTML.slice(0, 120));
  });
}

test('every page reflows at 320 CSS pixels without horizontal scrolling (WCAG 1.4.10)', async ({
  page,
}) => {
  // 320 px is what a 1280 px wide window shows at 400% zoom; 200% zoom is covered too.
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of pages) {
    await page.goto(path);
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(scrolls ? await overflowing(page) : [], `horizontal scroll on ${path}`).toEqual([]);
  }
});

test('text stays readable with increased text spacing (WCAG 1.4.12)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of pages) {
    await page.goto(path);
    await page.addStyleTag({
      content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`,
    });
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(scrolls ? await overflowing(page) : [], `overflow on ${path}`).toEqual([]);
  }
});

test('dark mode passes the same accessibility checks', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const path of pages) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      ),
      `axe (dark) on ${path}`,
    ).toEqual([]);
  }
});

test('the keyboard reaches every control, in order, with a visible focus indicator', async ({
  page,
}) => {
  for (const path of pages) {
    await page.goto(path);
    // Visible controls only: the closed gallery viewer's buttons are not reachable, by design.
    const focusable = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((element) => element.checkVisibility({ visibilityProperty: true })).length,
    );

    const reached: string[] = [];
    let leftPage = false;
    // Generous budget: a date-time input alone is five Tab stops (day, month, year, hour, minute).
    for (let i = 0; i <= focusable * 2 + 10; i++) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return null;
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          label: `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 40)}"`,
          outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
          // WCAG 2.4.11: the focused control must not be hidden off screen.
          inView:
            box.width > 0 &&
            box.height > 0 &&
            box.bottom > 0 &&
            box.right > 0 &&
            box.top < innerHeight &&
            box.left < innerWidth,
        };
      });
      if (!state) {
        leftPage = true; // Focus moved past the last control: nothing traps the keyboard.
        break;
      }
      expect(state.outline, `focus indicator on ${state.label} (${path})`).toBe(true);
      expect(state.inView, `${state.label} visible when focused (${path})`).toBe(true);
      reached.push(state.label);
    }

    expect(leftPage, `Tab leaves the last control on ${path}`).toBe(true);
    expect(reached[0], `first Tab on ${path}`).toMatch(
      /^a "(Skip to main content|Saltar al contenido principal)"$/,
    );
    expect(reached.length, `controls reached by Tab on ${path}`).toBe(focusable);
  }
});

test('the skip link moves focus to the main content', async ({ page }) => {
  await page.goto('/blog/hello-world/');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.keyboard.press('Tab');
  // The next stop is inside the article, not back in the header.
  expect(await page.evaluate(() => document.activeElement?.closest('main') !== null)).toBe(true);
});

test('nothing moves when the visitor asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of pages) {
    await page.goto(path);
    expect(await page.evaluate(() => document.getAnimations().length), path).toBe(0);
  }
});

test('every internal link, fragment and referenced file exists', async ({ page, request }) => {
  const checked = new Map<string, number>();
  const external = new Set<string>();

  async function status(url: URL) {
    const key = url.pathname;
    if (!checked.has(key)) checked.set(key, (await request.get(key)).status());
    return checked.get(key);
  }

  for (const path of pages) {
    await page.goto(path);
    const origin = new URL(page.url()).origin;
    const refs = await page.evaluate(() => [
      ...[...document.querySelectorAll<HTMLAnchorElement>('a[href]')].map((a) => a.href),
      ...[...document.querySelectorAll<HTMLLinkElement>('link[href]')].map((link) => link.href),
      ...[...document.querySelectorAll<HTMLMetaElement>('meta[property$=":image"]')].map(
        (meta) => meta.content,
      ),
    ]);
    for (const ref of refs) {
      const url = new URL(ref);
      if (url.origin !== origin) {
        external.add(url.href);
        continue;
      }
      expect(await status(url), `${url.pathname} linked from ${path}`).toBe(200);
      if (url.hash) {
        const target = decodeURIComponent(url.hash.slice(1));
        if (url.pathname !== new URL(page.url()).pathname) await page.goto(url.pathname);
        expect(await page.locator(`[id="${target}"]`).count(), `${url.href} from ${path}`).toBe(1);
        if (url.pathname !== new URL(path, origin).pathname) await page.goto(path);
      }
    }
  }

  // External sites are not fetched (that would make CI flaky); they must at least be HTTPS.
  for (const href of external) expect(href, 'external link').toMatch(/^https:\/\//);
});
