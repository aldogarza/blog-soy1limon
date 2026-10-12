export const LOCALES = ['en', 'es'] as const;

export type Locale = (typeof LOCALES)[number];

/** Served at the site root; the other language lives under its prefix (/en/). */
export const DEFAULT_LOCALE: Locale = 'es';

/** A value that may exist in some or all locales, e.g. alt text or tag labels. */
export type Localized<T> = Partial<Record<Locale, T>>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
