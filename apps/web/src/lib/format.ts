import { dateLocale, type Locale, siteConfig } from '@soy1limon/core';

/** Long date in the post language, in the site's time zone (builds run in UTC). */
export function formatDate(iso: string, lang: Locale): string {
  return new Intl.DateTimeFormat(dateLocale(lang), {
    dateStyle: 'long',
    timeZone: siteConfig.blog.timeZone,
  }).format(new Date(iso));
}
