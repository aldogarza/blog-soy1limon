import {
  blogPath,
  homePath,
  type Locale,
  LOCALES,
  mediaUrl,
  otherLocale,
  siteConfig,
  tagPath,
  tagsPath,
} from '@soy1limon/core';
import { postsIn, type SiteContent, tagsIn } from './content.ts';
import { paginate } from './paginate.ts';
import { absoluteUrl, alternates } from './seo.ts';

export interface SitemapEntry {
  path: string;
  lastmod: string | undefined;
  /** Equivalent pages in other languages (including this one), for xhtml:link hreflang. */
  versions: Partial<Record<Locale, string>>;
  images: string[];
}

const newest = (dates: string[]) => dates.sort().at(-1);

/**
 * Every indexable page: homes, archive pages, tag pages and posts. Search pages, redirect pages
 * and the 404 page are deliberately left out.
 */
export function sitemapEntries(
  content: SiteContent,
  mediaBase: string,
  site: URL | string,
): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const both = (build: (lang: Locale) => string) =>
    Object.fromEntries(LOCALES.map((lang) => [lang, build(lang)])) as Record<Locale, string>;

  for (const lang of LOCALES) {
    const posts = postsIn(content, lang);
    const lastPostUpdate = newest(posts.map((post) => post.updatedAt));

    entries.push({
      path: homePath(lang),
      lastmod: lastPostUpdate,
      versions: both(homePath),
      images: [],
    });
    for (const page of paginate(posts, siteConfig.blog.postsPerPage)) {
      entries.push({
        path: blogPath(lang, page.page),
        lastmod: newest(page.items.map((post) => post.updatedAt)),
        versions: page.page === 1 ? both((l) => blogPath(l)) : {},
        images: [],
      });
    }

    entries.push({
      path: tagsPath(lang),
      lastmod: lastPostUpdate,
      versions: both(tagsPath),
      images: [],
    });
    const otherTags = new Set(tagsIn(content, otherLocale(lang)).map((entry) => entry.tag.id));
    for (const { tag, posts: tagged } of tagsIn(content, lang)) {
      entries.push({
        path: tagPath(lang, tag.slug),
        lastmod: newest(tagged.map((post) => post.updatedAt)),
        versions: otherTags.has(tag.id)
          ? {
              [lang]: tagPath(lang, tag.slug),
              [otherLocale(lang)]: tagPath(otherLocale(lang), tag.slug),
            }
          : {},
        images: [],
      });
    }

    for (const post of posts) {
      const ids = [post.coverImageId, ...post.galleryImageIds, ...post.inlineImageIds].filter(
        (id): id is string => Boolean(id),
      );
      const images = [...new Set(ids)].flatMap((id) => {
        const file = content.images.get(id)?.variants.at(-1);
        return file ? [absoluteUrl(mediaUrl(mediaBase, file.key), site)] : [];
      });
      entries.push({
        path: post.path,
        lastmod: post.updatedAt,
        versions: post.translation
          ? { [post.lang]: post.path, [post.translation.lang]: post.translation.path }
          : {},
        images,
      });
    }
  }
  return entries;
}

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function renderSitemap(entries: SitemapEntry[], site: URL | string): string {
  const urls = entries.map((entry) => {
    const lines = [`  <url>`, `    <loc>${escapeXml(absoluteUrl(entry.path, site))}</loc>`];
    if (entry.lastmod)
      lines.push(`    <lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>`);
    for (const alternate of alternates(entry.versions, site)) {
      lines.push(
        `    <xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${escapeXml(alternate.href)}"/>`,
      );
    }
    for (const image of entry.images) {
      lines.push(`    <image:image><image:loc>${escapeXml(image)}</image:loc></image:image>`);
    }
    lines.push('  </url>');
    return lines.join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
