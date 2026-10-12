import { rm } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { createPost, syncPostImages, updatePost } from '@soy1limon/db/admin';
import { closeExiftool } from '@soy1limon/media';
import { expect, type Page, test } from '@playwright/test';
import { adminDb, exiftool, seedImage } from './helpers.ts';

// Automated part of the quality pass (docs/accessibility.md) over every admin page.

const run = crypto.randomUUID().slice(0, 6);
const created = { images: [] as string[], post: '' };
let pages: string[] = [];

test.beforeAll(async () => {
  const cover = await seedImage(created.images, `e2e-${run}-quality-cover`, '#4682b4', {
    en: 'A steel blue square',
  });
  const extra = await seedImage(created.images, `e2e-${run}-quality-extra`, '#daa520', {
    en: 'A golden square',
  });
  const db = adminDb();
  const post = await createPost(db, {
    lang: 'en',
    slug: `quality-${run}`,
    title: 'Quality pass',
    description: 'A post with a cover and a gallery.',
    bodyMd: `Some text.\n\n![A golden square](image:${extra})`,
    coverImageId: cover,
  });
  await syncPostImages(db, post.id, { gallery: [cover, extra], inline: [extra] });
  await updatePost(db, post.id, { title: 'Quality pass' });
  created.post = post.id;
  pages = [
    '/',
    '/media',
    '/media/upload',
    `/media/${cover}`,
    '/posts',
    '/posts/new',
    `/posts/${post.id}`,
  ];
});

test.afterAll(async () => {
  const db = adminDb();
  await db.from('revisions').delete().eq('entity_id', created.post);
  await db.from('posts').delete().eq('id', created.post);
  for (const id of created.images) {
    await db.from('revisions').delete().eq('entity_id', id);
    await db.from('images').delete().eq('id', id);
  }
  await exiftool.end();
  await closeExiftool();
  await rm(process.env.E2E_MEDIA_ROOT ?? '', { recursive: true, force: true });
});

/** Waits until Vue islands have hydrated, so their controls exist and react to the keyboard. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('astro-island')].every((island) => !island.hasAttribute('ssr')),
  );
}

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
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of pages) {
    await open(page, path);
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(scrolls ? await overflowing(page) : [], `horizontal scroll on ${path}`).toEqual([]);
  }
});

test('dark mode passes the same accessibility checks', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const path of pages) {
    await open(page, path);
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

test('the keyboard reaches every control with a visible focus indicator', async ({ page }) => {
  for (const path of pages) {
    await open(page, path);
    const focusable = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"]), summary',
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
          label: `${element.tagName.toLowerCase()}#${element.id} "${(element.textContent ?? element.getAttribute('aria-label') ?? '').trim().slice(0, 40)}"`,
          outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
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
    expect(reached[0], `first Tab on ${path}`).toMatch(/^a# "Skip to main content"$/);
  }
});

test('nothing moves when the author asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of pages) {
    await open(page, path);
    expect(await page.evaluate(() => document.getAnimations().length), path).toBe(0);
  }
});
