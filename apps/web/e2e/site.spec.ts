import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { siteConfig } from '@soy1limon/core';
import { crawl } from './crawl.ts';

test('every page is reachable, accessible and well structured', async ({ page, request }) => {
  const pages = await crawl(page);
  expect(pages.length).toBeGreaterThanOrEqual(16);

  const assets = new Set<string>();
  for (const path of pages) {
    await page.goto(path);
    const lang = path.startsWith('/en/') ? 'en' : 'es';
    await expect(page.locator('html'), path).toHaveAttribute('lang', lang);
    await expect(page.locator('h1'), `one h1 on ${path}`).toHaveCount(1);

    const images = await page.locator('img').evaluateAll((imgs) =>
      imgs.map((img) => ({
        alt: img.getAttribute('alt'),
        // A card's cover repeats the post title next to it, so it is decorative (empty alt).
        decorative: img.closest('.post-card') !== null,
        width: img.getAttribute('width'),
        height: img.getAttribute('height'),
        src: (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src,
        srcset: img.getAttribute('srcset') ?? '',
      })),
    );
    for (const image of images) {
      if (image.decorative) expect(image.alt, `empty alt on ${image.src}`).toBe('');
      else expect(image.alt, `alt on ${image.src}`).toBeTruthy();
      expect(image.width && image.height, `dimensions on ${image.src}`).toBeTruthy();
      assets.add(new URL(image.src, page.url()).pathname);
      for (const candidate of image.srcset.split(',')) {
        const url = candidate.trim().split(' ')[0];
        if (url) assets.add(new URL(url, page.url()).pathname);
      }
    }

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

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
}

test('every page has canonical, description, social tags, valid JSON-LD and reciprocal hreflang', async ({
  page,
}) => {
  const pages = await crawl(page);
  const hreflangs = new Map<string, Map<string, string>>();

  for (const path of pages) {
    await page.goto(path);
    const url = new URL(path, page.url()).href;
    await expect(page.locator('link[rel="canonical"]'), path).toHaveAttribute('href', url);
    expect(
      await page.locator('meta[name="description"]').getAttribute('content'),
      path,
    ).toBeTruthy();
    for (const property of ['og:title', 'og:description', 'og:url', 'og:image', 'og:locale']) {
      expect(
        await page.locator(`meta[property="${property}"]`).getAttribute('content'),
        `${property} on ${path}`,
      ).toBeTruthy();
    }
    // Test builds are development builds: never indexable, never counted.
    await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    expect(await page.content(), path).not.toContain('cloudflareinsights');

    for (const block of await page
      .locator('script[type="application/ld+json"]')
      .allTextContents()) {
      const data = JSON.parse(block) as { '@context'?: string; '@type'?: string };
      expect(data['@context'], path).toBe('https://schema.org');
      expect(data['@type'], path).toBeTruthy();
    }

    const links = await page
      .locator('link[rel="alternate"][hreflang]')
      .evaluateAll((elements) =>
        elements.map((element) => [
          element.getAttribute('hreflang') ?? '',
          element.getAttribute('href') ?? '',
        ]),
      );
    hreflangs.set(url, new Map(links as [string, string][]));
  }

  // If A says B is its Spanish version, B must say A is its English version (and both list themselves).
  for (const [url, links] of hreflangs) {
    if (links.size === 0) continue;
    expect([...links.values()], `self reference on ${url}`).toContain(url);
    for (const [lang, href] of links) {
      if (lang === 'x-default' || href === url) continue;
      expect([...(hreflangs.get(href)?.values() ?? [])], `${href} links back to ${url}`).toContain(
        url,
      );
    }
  }
});

test('the sitemap lists exactly the canonical, indexable pages', async ({ page, request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1] ?? '');
  expect(locs.length).toBeGreaterThanOrEqual(12);
  for (const loc of locs) {
    expect(loc).not.toMatch(/\/search\/|\/blog\/hello\/$|404/);
    const response = await page.goto(loc);
    expect(response?.status(), loc).toBe(200);
    await expect(page.locator('link[rel="canonical"]'), loc).toHaveAttribute('href', loc);
  }
  expect(xml).toContain('<image:loc>');
  expect(xml).toContain('hreflang="x-default"');
});

test('robots.txt keeps crawlers out of non-production builds and points to the sitemap', async ({
  request,
}) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /');
  expect(robots).toMatch(/Sitemap: http:\/\/127\.0\.0\.1:4330\/sitemap\.xml/);
});

test('a post shows its cover, inline image, tags and translation', async ({ page }) => {
  await page.goto('/en/blog/hello-world/');
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, world' })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'A calm blue river under a pale morning sun' }),
  ).toHaveAttribute('fetchpriority', 'high');
  await expect(
    page.getByRole('img', { name: 'A green forest fading into a bright clearing' }),
  ).toHaveAttribute('loading', 'lazy');
  await expect(page.getByRole('link', { name: 'Notes' })).toHaveAttribute(
    'href',
    '/en/tags/notes/',
  );
  const translation = page.getByRole('link', { name: 'Leer en español: Hola, mundo' });
  await expect(translation).toHaveAttribute('hreflang', 'es');
  await translation.click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/blog\/hola-mundo\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('a gallery links every photo to its largest file, with alt text in the post language', async ({
  page,
}) => {
  await page.goto('/blog/hola-mundo/');
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

test('a gallery photo opens in an accessible viewer that keeps and returns focus', async ({
  page,
}) => {
  await page.goto('/blog/hola-mundo/');
  const gallery = page.getByRole('region', { name: 'Galería' });
  const first = gallery.getByRole('link').first();
  await first.click();

  const viewer = page.getByRole('dialog', { name: 'Galería' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('img')).toHaveAttribute(
    'alt',
    'Un bosque verde que se abre a un claro luminoso',
  );
  await expect(viewer.getByText('Foto 1 de 2')).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Foto siguiente' })).toBeFocused();
  await expectNoViolations(page);

  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByText('Foto 2 de 2')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByText('Foto 1 de 2')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(first).toBeFocused();
});

test('an old address redirects to the renamed post', async ({ page }) => {
  await page.goto('/en/blog/hello/');
  await expect(page).toHaveURL(/\/blog\/hello-world\/$/);
});

test('the search box in the bar shows results in the page language while typing', async ({
  page,
}) => {
  await page.goto('/en/');
  const box = page.getByRole('searchbox', { name: 'Search the blog' });
  const panel = page.locator('.search-panel');
  await box.fill('river');
  await expect(panel.getByRole('link', { name: 'Hello, world' })).toBeVisible();
  await expect(page.locator('.site-search [role="status"]')).toHaveText('1 result');
  await expectNoViolations(page);

  await page.keyboard.press('ArrowDown');
  await expect(panel.getByRole('link', { name: 'Hello, world' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(box).toBeFocused();

  // Enter opens the full results, and the box keeps the query.
  await box.press('Enter');
  await expect(page).toHaveURL(/\/en\/search\/\?q=river$/);
  await expect(page.locator('.search-status')).toHaveText('1 result');
  await expect(
    page.locator('.search-results').getByRole('link', { name: 'Hello, world' }),
  ).toBeVisible();
  await expect(box).toHaveValue('river');

  await page.goto('/search/?q=compartir');
  await expect(page.locator('.search-status')).toHaveText('1 resultado');
  await expect(
    page.locator('.search-results').getByRole('link', { name: 'Hola, mundo' }),
  ).toBeVisible();
});

test('on a phone the search box is a magnifying glass that grows while in use', async ({
  page,
}) => {
  // A design of the iStyle theme; other themes may show the whole box.
  test.skip((process.env.THEME ?? siteConfig.theme) !== 'istyle', 'iStyle only');
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto('/');
  const box = page.getByRole('searchbox', { name: 'Buscar en el blog' });
  expect((await box.boundingBox())?.width).toBeLessThan(48);
  await box.focus();
  expect((await box.boundingBox())?.width).toBeGreaterThan(300);
  await box.fill('mercado');
  await expect(
    page.locator('.search-panel').getByRole('link', { name: 'El mercado del domingo' }),
  ).toBeVisible();
  await expectNoViolations(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  expect((await box.boundingBox())?.width).toBeLessThan(48);
});

test('the home page shows the newest posts, then loads every other one in place', async ({
  page,
}) => {
  await page.goto('/');
  const latest = page.getByRole('region', { name: 'Entradas recientes' });
  await expect(latest.getByRole('article')).toHaveCount(3);
  const more = page.getByRole('region', { name: 'Más entradas' });
  await expect(more.getByRole('article')).toHaveCount(2);

  // A press loads the next page and moves the focus to its first post.
  await more.getByRole('button', { name: 'Cargar más entradas' }).click();
  await expect(more.getByRole('link', { name: 'El mercado del domingo' })).toBeFocused();

  // Near the end of the list the rest loads on its own.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(more.getByRole('article')).toHaveCount(5);
  await expect(more.getByRole('heading', { level: 3 })).toHaveCount(5);
  await expect(more.getByRole('button')).toHaveCount(0);
  await expect(more.getByRole('status')).toHaveText(
    'Se cargó 1 entrada más. Ya están todas las entradas.',
  );
  await expectNoViolations(page);
});

test('without JavaScript, search and the archive still work as plain pages', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  const next = page.getByRole('link', { name: 'Cargar más entradas' });
  await expect(next).toHaveAttribute('href', '/page/2/');
  await next.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Más entradas · Página 2 de 3');
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('link', { name: 'Entradas anteriores' }).click();
  await expect(page).toHaveURL(/\/page\/3\/$/);
  await page.getByRole('link', { name: 'Entradas más nuevas' }).click();
  await page.getByRole('link', { name: 'Entradas más nuevas' }).click();
  await expect(page).toHaveURL(/:\d+\/$/);

  await page.getByRole('searchbox', { name: 'Buscar en el blog' }).fill('río');
  await page.getByRole('searchbox', { name: 'Buscar en el blog' }).press('Enter');
  await expect(page).toHaveURL(/\/search\/\?q=r%C3%ADo$/);
  await context.close();
});

test('the old blog index sends visitors to the home page, and the tag index is gone', async ({
  page,
  request,
}) => {
  await page.goto('/blog/');
  await expect(page).toHaveURL(/:\d+\/$/);
  await page.goto('/en/blog/');
  await expect(page).toHaveURL(/\/en\/$/);
  expect((await request.get('/tags/')).status()).toBe(404);
  expect((await request.get('/en/tags/notes/')).status()).toBe(200);
});

test('unknown pages get a bilingual 404', async ({ page }) => {
  const response = await page.goto('/does-not-exist/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Page not found' })).toBeVisible();
});

test('the RSS feeds list posts of their language', async ({ request }) => {
  const english = await (await request.get('/en/rss.xml')).text();
  expect(english).toContain('<language>en</language>');
  expect(english).toContain('/en/blog/hello-world/');
  const spanish = await (await request.get('/rss.xml')).text();
  expect(spanish).toContain('<language>es</language>');
  expect(spanish).toContain('/blog/hola-mundo/');
  expect(spanish).not.toContain('/en/');
});
