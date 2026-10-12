import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/** Every internal page reachable from the home pages, discovered by following links. */
async function crawl(page: Page): Promise<string[]> {
  const queue = ['/', '/es/'];
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

test('every page is reachable, accessible, well structured and script-free', async ({
  page,
  request,
}) => {
  const pages = await crawl(page);
  expect(pages.length).toBeGreaterThanOrEqual(16);

  const assets = new Set<string>();
  for (const path of pages) {
    await page.goto(path);
    const lang = path.startsWith('/es/') ? 'es' : 'en';
    await expect(page.locator('html'), path).toHaveAttribute('lang', lang);
    await expect(page.locator('h1'), `one h1 on ${path}`).toHaveCount(1);

    const images = await page.locator('img').evaluateAll((imgs) =>
      imgs.map((img) => ({
        alt: img.getAttribute('alt'),
        width: img.getAttribute('width'),
        height: img.getAttribute('height'),
        src: (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src,
        srcset: img.getAttribute('srcset') ?? '',
      })),
    );
    for (const image of images) {
      expect(image.alt, `alt on ${image.src}`).toBeTruthy();
      expect(image.width && image.height, `dimensions on ${image.src}`).toBeTruthy();
      assets.add(new URL(image.src, page.url()).pathname);
      for (const candidate of image.srcset.split(',')) {
        const url = candidate.trim().split(' ')[0];
        if (url) assets.add(new URL(url, page.url()).pathname);
      }
    }

    const scripts = await page.locator('script').count();
    if (!path.endsWith('/search/')) expect(scripts, `no JavaScript on ${path}`).toBe(0);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      ),
      `axe on ${path}`,
    ).toEqual([]);
  }

  for (const asset of assets) {
    const response = await request.get(asset);
    expect(response.status(), `asset ${asset}`).toBe(200);
  }
});

test('a post shows its cover, inline image, tags and translation', async ({ page }) => {
  await page.goto('/blog/hello-world/');
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, world' })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'A calm blue river under a pale morning sun' }),
  ).toHaveAttribute('fetchpriority', 'high');
  await expect(
    page.getByRole('img', { name: 'A green forest fading into a bright clearing' }),
  ).toHaveAttribute('loading', 'lazy');
  await expect(page.getByRole('link', { name: 'Notes' })).toHaveAttribute('href', '/tags/notes/');
  const translation = page.getByRole('link', { name: 'Leer en español: Hola, mundo' });
  await expect(translation).toHaveAttribute('hreflang', 'es');
  await translation.click();
  await expect(page).toHaveURL(/\/es\/blog\/hola-mundo\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('a gallery links every photo to its largest file, with alt text in the post language', async ({
  page,
}) => {
  await page.goto('/es/blog/hola-mundo/');
  const gallery = page.getByRole('region', { name: 'Galería' });
  await expect(gallery.getByRole('listitem')).toHaveCount(2);
  const first = gallery.getByRole('link').first();
  await expect(first).toHaveAttribute('href', /forest-trail-[0-9a-f]{8}-800\.webp$/);
  await expect(first.getByRole('img')).toHaveAttribute(
    'alt',
    'Un bosque verde que se abre a un claro luminoso',
  );
  await expect(gallery.getByText('Sendero en el bosque')).toBeVisible();
});

test('an old address redirects to the renamed post', async ({ page }) => {
  await page.goto('/blog/hello/');
  await expect(page).toHaveURL(/\/blog\/hello-world\/$/);
});

test('search finds posts in the language of the page only', async ({ page }) => {
  await page.goto('/search/');
  await page.getByLabel('Search the blog').fill('river');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('status')).toHaveText('1 result');
  await expect(page.getByRole('link', { name: 'Hello, world' })).toBeVisible();

  await page.goto('/es/search/?q=compartir');
  await expect(page.getByRole('status')).toHaveText('1 resultado');
  await expect(page.getByRole('link', { name: 'Hola, mundo' })).toBeVisible();
});

test('unknown pages get a bilingual 404', async ({ page }) => {
  const response = await page.goto('/does-not-exist/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Página no encontrada' })).toBeVisible();
});

test('the RSS feeds list posts of their language', async ({ request }) => {
  const english = await (await request.get('/rss.xml')).text();
  expect(english).toContain('<language>en</language>');
  expect(english).toContain('/blog/hello-world/');
  expect(english).not.toContain('/es/blog/');
  const spanish = await (await request.get('/es/rss.xml')).text();
  expect(spanish).toContain('/es/blog/hola-mundo/');
});
