import { localePrefix } from './i18n.ts';
import type { Locale } from './locales.ts';

// Every public URL is built here, so the admin, the site and the sitemap always agree.
// Paths end with a slash because the site is built with `trailingSlash: 'always'`.

export const homePath = (lang: Locale) => `${localePrefix(lang)}/`;

export const postPath = (lang: Locale, slug: string) => `${localePrefix(lang)}/blog/${slug}/`;

/** Page 1 is the blog index itself; later pages live under /blog/page/N/. */
export const blogPath = (lang: Locale, page = 1) =>
  page <= 1 ? `${localePrefix(lang)}/blog/` : `${localePrefix(lang)}/blog/page/${page}/`;

export const tagsPath = (lang: Locale) => `${localePrefix(lang)}/tags/`;

export const tagPath = (lang: Locale, slug: string) => `${localePrefix(lang)}/tags/${slug}/`;

export const searchPath = (lang: Locale) => `${localePrefix(lang)}/search/`;

export const rssPath = (lang: Locale) => `${localePrefix(lang)}/rss.xml`;
