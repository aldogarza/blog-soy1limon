import { z } from 'zod';
import { DEFAULT_LOCALE, LOCALES } from './locales.ts';

export const WATERMARK_POSITIONS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;

export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

const localizedText = z.object({ en: z.string().min(1), es: z.string().min(1) });

export const siteConfigSchema = z.object({
  locales: z.array(z.enum(LOCALES)).nonempty(),
  defaultLocale: z.enum(LOCALES),
  title: localizedText,
  description: localizedText,
  author: z.object({
    name: z.string().min(1),
    /** Public profile used in JSON-LD `author.url`; null until a profile/about page exists. */
    url: z.url().nullable(),
  }),
  /** Defaults prefilled in the image metadata form; every field stays editable per image. */
  imageDefaults: z.object({
    creator: z.string().min(1),
    /** `{year}` is replaced with the year the photo was taken (or uploaded). */
    copyrightNotice: z.string().min(1),
    creditText: z.string().min(1),
    /** Page describing how images may be used. Required by Google Images for the "Licensable" badge. */
    licenseUrl: z.url().nullable(),
    keepCameraInfo: z.boolean(),
    keepLocation: z.boolean(),
  }),
  watermark: z.object({
    enabledByDefault: z.boolean(),
    text: z.string().min(1),
    position: z.enum(WATERMARK_POSITIONS),
    opacity: z.number().gt(0).lte(1),
    /** Watermark height as a fraction of the variant width, so it looks the same at every size. */
    relativeSize: z.number().gt(0).lte(0.2),
    /** Never render the watermark smaller than this, otherwise it turns into noise on small variants. */
    minSizePx: z.number().int().positive(),
    /** Distance from the edges as a fraction of the variant width. */
    marginRatio: z.number().gte(0).lte(0.2),
  }),
  media: z.object({
    widths: z
      .array(z.number().int().positive())
      .nonempty()
      .refine((widths) => widths.every((w, i) => i === 0 || w > (widths[i - 1] ?? 0)), {
        error: 'media.widths must be strictly ascending',
      }),
    webpQuality: z.number().int().min(1).max(100),
    webpEffort: z.number().int().min(0).max(6),
    maxUploadBytes: z.number().int().positive(),
    maxInputPixels: z.number().int().positive(),
  }),
  privacy: z.object({
    /**
     * Words that should never leak through photo metadata (e.g. the author's full name in a
     * device owner field). The admin warns when an uploaded file contains any of them.
     * Location, device model and timestamps are NOT treated as sensitive: keeping them is a choice.
     */
    sensitiveTerms: z.array(z.string().min(2)),
  }),
  blog: z.object({
    postsPerPage: z.number().int().positive(),
    /** IANA zone used to display dates, so a build running in UTC does not shift the day. */
    timeZone: z.string().min(1),
  }),
  seo: z.object({
    titleMaxLength: z.number().int().positive(),
    descriptionMaxLength: z.number().int().positive(),
    altTextRecommendedMaxLength: z.number().int().positive(),
  }),
});

export type SiteConfig = z.infer<typeof siteConfigSchema>;

/**
 * Public, non-secret site configuration. Lives in git on purpose: changes are versioned and reviewed.
 * Secrets never go here — they belong in the .env files described in docs/setup.md.
 */
export const siteConfig = {
  locales: [...LOCALES],
  defaultLocale: DEFAULT_LOCALE,
  title: { en: 'soy1limon', es: 'soy1limon' },
  description: {
    en: 'Personal blog by Aldo.',
    es: 'Blog personal de Aldo.',
  },
  author: {
    name: 'Aldo',
    url: null,
  },
  imageDefaults: {
    creator: 'Aldo',
    copyrightNotice: '© {year} Aldo. All rights reserved.',
    creditText: 'Aldo / soy1limon',
    licenseUrl: null,
    keepCameraInfo: true,
    // Photos are mostly travel and public places; locations may later feed a map of the photos.
    keepLocation: true,
  },
  watermark: {
    enabledByDefault: true,
    text: '© soy1limon',
    position: 'bottom-right',
    opacity: 0.6,
    relativeSize: 0.035,
    minSizePx: 14,
    marginRatio: 0.02,
  },
  media: {
    widths: [400, 800, 1200, 1600, 2000],
    webpQuality: 80,
    webpEffort: 5,
    maxUploadBytes: 200 * 1024 * 1024,
    // Sharp's default limit (16383 x 16383); protects against decompression bombs.
    maxInputPixels: 268_402_689,
  },
  privacy: {
    sensitiveTerms: ['Aldo'],
  },
  blog: {
    postsPerPage: 10,
    timeZone: 'America/Monterrey',
  },
  seo: {
    titleMaxLength: 60,
    descriptionMaxLength: 160,
    altTextRecommendedMaxLength: 125,
  },
} satisfies SiteConfig;
