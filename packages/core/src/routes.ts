import { localePrefix } from './i18n.ts';
import type { Locale } from './locales.ts';

// Every public URL is built here, so the admin, the site and the sitemap always agree.
// Paths end with a slash because the site is built with `trailingSlash: 'always'`.

export const homePath = (lang: Locale) => `${localePrefix(lang)}/`;

export const postPath = (lang: Locale, slug: string) => `${localePrefix(lang)}/blog/${slug}/`;

/**
 * The list of every post starts on the home page; its later pages live under /page/N/ (the home
 * page loads them in place while scrolling, these addresses serve crawlers and visitors without
 * JavaScript).
 */
export const archivePath = (lang: Locale, page = 1) =>
  page <= 1 ? homePath(lang) : `${localePrefix(lang)}/page/${page}/`;

/** The old blog index; it only redirects to the home page now. */
export const legacyBlogPath = (lang: Locale) => `${localePrefix(lang)}/blog/`;

export const tagPath = (lang: Locale, slug: string) => `${localePrefix(lang)}/tags/${slug}/`;

export const searchPath = (lang: Locale) => `${localePrefix(lang)}/search/`;

export const rssPath = (lang: Locale) => `${localePrefix(lang)}/rss.xml`;
