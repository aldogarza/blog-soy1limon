import { loadFixtureContent } from '@soy1limon/db';
import { describe, expect, it } from 'vitest';
import { buildSiteContent } from './content.ts';
import {
  alternates,
  blogPostingJsonLd,
  breadcrumbJsonLd,
  imageJsonLd,
  ogImageFor,
  serializeJsonLd,
} from './seo.ts';
import { renderSitemap, sitemapEntries } from './sitemap.ts';

const SITE = 'https://example.com';

describe('alternates', () => {
  it('lists every version plus x-default pointing to Spanish', () => {
    expect(alternates({ en: '/en/blog/a/', es: '/blog/b/' }, SITE)).toEqual([
      { hreflang: 'en', href: 'https://example.com/en/blog/a/' },
      { hreflang: 'es', href: 'https://example.com/blog/b/' },
      { hreflang: 'x-default', href: 'https://example.com/blog/b/' },
    ]);
  });

  it('is empty for a page that exists in one language only', () => {
    expect(alternates({ es: '/blog/b/' }, SITE)).toEqual([]);
  });
});

describe('structured data', () => {
  it('describes a post with author, dates, language, keywords and images', async () => {
    const content = await buildSiteContent(loadFixtureContent(), 'https://img.example.com');
    const post = content.posts.find((p) => p.slug === 'hello-world');
    if (!post?.cover) throw new Error('fixture changed');
    const data = blogPostingJsonLd(
      { ...post, tags: ['Notes'], images: [post.cover] },
      'https://img.example.com',
      SITE,
    );
    expect(data).toMatchObject({
      '@type': 'BlogPosting',
      headline: 'Hello, world',
      url: 'https://example.com/en/blog/hello-world/',
      inLanguage: 'en',
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      keywords: 'Notes',
      author: { '@type': 'Person', name: 'Aldo Garza' },
    });
    expect(JSON.stringify(data)).toContain(
      'https://img.example.com/images/2026/river-at-dawn-86ec97ff-800.webp',
    );
  });

  it('adds the licence fields Google Images needs only when a licence URL exists', async () => {
    const { images } = loadFixtureContent();
    const image = images[0];
    if (!image) throw new Error('fixture changed');
    expect(imageJsonLd(image, 'en', '/m', SITE)).not.toHaveProperty('license');
    const licensed = {
      ...image,
      metadata: {
        ...image.metadata,
        licenseUrl: 'https://example.com/license/',
        creditText: 'Aldo Garza',
      },
    };
    expect(imageJsonLd(licensed, 'en', '/m', SITE)).toMatchObject({
      license: 'https://example.com/license/',
      acquireLicensePage: 'https://example.com/license/',
      creditText: 'Aldo Garza',
      creator: { '@type': 'Person', name: 'Aldo Garza' },
      copyrightNotice: '© 2026 Aldo Garza. All rights reserved.',
    });
  });

  it('numbers breadcrumb items from 1 with absolute URLs', () => {
    expect(
      breadcrumbJsonLd(
        [
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/en/blog/' },
        ],
        SITE,
      ).itemListElement,
    ).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://example.com/en/blog/' },
    ]);
  });

  it('cannot break out of the script element', () => {
    const json = serializeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Thing',
      name: '</script><script>alert(1)</script>',
    });
    expect(json).not.toContain('</script>');
    expect(JSON.parse(json).name).toBe('</script><script>alert(1)</script>');
  });

  it('picks a social image of at least 1200 px when one exists, otherwise the largest', () => {
    const { images } = loadFixtureContent();
    const image = images[0];
    if (!image) throw new Error('fixture changed');
    expect(ogImageFor(image, 'es', '/m', SITE)).toEqual({
      url: 'https://example.com/m/images/2026/river-at-dawn-86ec97ff-800.webp',
      width: 800,
      height: 533,
      alt: 'Un río azul y tranquilo bajo el sol de la mañana',
    });
  });
});

describe('sitemap', () => {
  it('lists indexable pages with lastmod, hreflang pairs and images, and nothing else', async () => {
    const content = await buildSiteContent(loadFixtureContent(), '/m');
    const xml = renderSitemap(sitemapEntries(content, '/m', SITE, 2), SITE);
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
    // 8 Spanish posts: 3 on the home page, then pages of 2 (the home page shows page 1).
    expect(locs).toContain('https://example.com/page/3/');
    expect(locs).not.toContain('https://example.com/page/4/');
    expect(locs).not.toContain('https://example.com/blog/');
    expect(locs).not.toContain('https://example.com/tags/');
    expect(locs).toContain('https://example.com/en/blog/hello-world/');
    expect(locs).toContain('https://example.com/tags/travel/');
    expect(locs).not.toContain('https://example.com/en/blog/hello/');
    expect(locs.some((loc) => loc?.includes('/search/'))).toBe(false);
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="es" href="https://example.com/blog/hola-mundo/"/>',
    );
    expect(xml).toContain(
      '<image:loc>https://example.com/m/images/2026/forest-trail-382ebc01-800.webp</image:loc>',
    );
    expect(xml).toContain('<lastmod>2026-10-03T18:30:00.000Z</lastmod>');
  });
});
