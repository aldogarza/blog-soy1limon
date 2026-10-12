import {
  type Locale,
  LOCALES,
  mediaUrl,
  pickVariant,
  siteConfig,
  type ImageVariant,
} from '@soy1limon/core';
import type { PublicImage } from '@soy1limon/db';
import type {
  BlogPosting,
  BreadcrumbList,
  ImageObject,
  Person,
  Thing,
  WebSite,
  WithContext,
} from 'schema-dts';

export interface Alternate {
  hreflang: Locale | 'x-default';
  href: string;
}

export interface OgImage {
  url: string;
  width: number;
  height: number;
  alt: string;
}

/** Default social preview for pages without photos (public/og-default.png). */
export const DEFAULT_OG_IMAGE = { path: '/og-default.png', width: 1200, height: 630 } as const;

// Large social cards want at least 1200 px wide; smaller variants are only used if nothing larger exists.
const OG_MIN_WIDTH = 1200;

export const absoluteUrl = (path: string, site: URL | string) => new URL(path, site).href;

export const ogLocale = (lang: Locale) => (lang === 'es' ? 'es_MX' : 'en_US');

/**
 * hreflang links for a page that exists in several languages. Every version lists all versions,
 * itself included, and x-default points to the default-language version (Google's guidance).
 */
export function alternates(
  paths: Partial<Record<Locale, string>>,
  site: URL | string,
): Alternate[] {
  const entries = LOCALES.flatMap((lang) => {
    const path = paths[lang];
    return path ? [{ hreflang: lang, href: absoluteUrl(path, site) } satisfies Alternate] : [];
  });
  if (entries.length < 2) return [];
  const fallback = paths[siteConfig.defaultLocale] ?? entries[0]?.href ?? '';
  return [...entries, { hreflang: 'x-default', href: absoluteUrl(fallback, site) }];
}

export function ogImageFor(
  image: PublicImage,
  lang: Locale,
  mediaBase: string,
  site: URL | string,
): OgImage | undefined {
  const variant = pickVariant(image.variants, OG_MIN_WIDTH);
  if (!variant) return undefined;
  return {
    url: absoluteUrl(mediaUrl(mediaBase, variant.key), site),
    width: variant.w,
    height: variant.h,
    alt: image.alt[lang] ?? '',
  };
}

export function defaultOgImage(lang: Locale, site: URL | string): OgImage {
  return {
    url: absoluteUrl(DEFAULT_OG_IMAGE.path, site),
    width: DEFAULT_OG_IMAGE.width,
    height: DEFAULT_OG_IMAGE.height,
    alt: siteConfig.title[lang],
  };
}

function author(site: URL | string): Person {
  return {
    '@type': 'Person',
    name: siteConfig.author.name,
    url: siteConfig.author.url ?? absoluteUrl('/', site),
  };
}

function largest(variants: readonly ImageVariant[]): ImageVariant | undefined {
  return [...variants].sort((a, b) => b.w - a.w)[0];
}

/**
 * ImageObject with the rights fields Google Images uses for the "Licensable" badge
 * (license, acquireLicensePage, creator, creditText, copyrightNotice).
 */
export function imageJsonLd(
  image: PublicImage,
  lang: Locale,
  mediaBase: string,
  site: URL | string,
): ImageObject {
  const file = largest(image.variants);
  const m = image.metadata;
  return {
    '@type': 'ImageObject',
    contentUrl: file ? absoluteUrl(mediaUrl(mediaBase, file.key), site) : undefined,
    width: { '@type': 'QuantitativeValue', value: file?.w ?? image.width, unitCode: 'E37' },
    height: { '@type': 'QuantitativeValue', value: file?.h ?? image.height, unitCode: 'E37' },
    ...(image.alt[lang] ? { description: image.alt[lang] } : {}),
    ...(image.caption[lang] ? { caption: image.caption[lang] } : {}),
    ...(m.creator ? { creator: { '@type': 'Person', name: m.creator } } : {}),
    ...(m.creditText ? { creditText: m.creditText } : {}),
    ...(m.copyrightNotice ? { copyrightNotice: m.copyrightNotice } : {}),
    ...(m.licenseUrl ? { license: m.licenseUrl, acquireLicensePage: m.licenseUrl } : {}),
  };
}

export interface PostForJsonLd {
  lang: Locale;
  title: string;
  description: string;
  path: string;
  publishedAt: string;
  updatedAt: string;
  tags: string[];
  images: PublicImage[];
}

export function blogPostingJsonLd(
  post: PostForJsonLd,
  mediaBase: string,
  site: URL | string,
): WithContext<BlogPosting> {
  const url = absoluteUrl(post.path, site);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: url,
    inLanguage: post.lang,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: author(site),
    ...(post.tags.length > 0 ? { keywords: post.tags.join(', ') } : {}),
    ...(post.images.length > 0
      ? { image: post.images.map((image) => imageJsonLd(image, post.lang, mediaBase, site)) }
      : {}),
  };
}

export function breadcrumbJsonLd(
  items: { name: string; path: string }[],
  site: URL | string,
): WithContext<BreadcrumbList> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, site),
    })),
  };
}

export function websiteJsonLd(
  lang: Locale,
  homePath: string,
  site: URL | string,
): WithContext<WebSite> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.title[lang],
    description: siteConfig.description[lang],
    url: absoluteUrl(homePath, site),
    inLanguage: lang,
    author: author(site),
  };
}

/**
 * Safe for a <script type="application/ld+json"> block: `<` is escaped so a title containing
 * "</script>" cannot end the element early.
 */
export function serializeJsonLd(data: WithContext<Thing> | WithContext<Thing>[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
