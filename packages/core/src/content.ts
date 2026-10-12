import { z } from 'zod';
import { LOCALES } from './locales.ts';
import { SLUG_PATTERN } from './slug.ts';

/** Text available in some or all locales, stored as jsonb `{ "en": "...", "es": "..." }`. */
export const localizedTextSchema = z.partialRecord(z.enum(LOCALES), z.string());

export type LocalizedText = z.infer<typeof localizedTextSchema>;

export const slugSchema = z.string().regex(SLUG_PATTERN).max(80);

export const POST_STATUSES = ['draft', 'published', 'archived'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const IMAGE_STATUSES = ['processing', 'ready', 'failed'] as const;
export type ImageStatus = (typeof IMAGE_STATUSES)[number];

export const POST_IMAGE_ROLES = ['gallery', 'inline'] as const;
export type PostImageRole = (typeof POST_IMAGE_ROLES)[number];

/** One public WebP rendition of an image. */
export const imageVariantSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  bytes: z.number().int().positive(),
  key: z.string().min(1),
});

export type ImageVariant = z.infer<typeof imageVariantSchema>;

export const imageVariantsSchema = z.array(imageVariantSchema);

/**
 * Metadata embedded into every public variant (EXIF + XMP) and edited in the admin form.
 * Every field is optional: a missing field means "do not write it".
 */
export const embeddedMetadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  creator: z.string().optional(),
  copyrightNotice: z.string().optional(),
  creditText: z.string().optional(),
  licenseUrl: z.url().optional(),
  keywords: z.array(z.string().min(1)).optional(),
  /** ISO 8601 date-time as written by the camera, e.g. "2026-03-14T18:22:05-06:00". */
  dateTaken: z.string().optional(),
  camera: z
    .object({
      make: z.string().optional(),
      model: z.string().optional(),
      lens: z.string().optional(),
      focalLengthMm: z.number().positive().optional(),
      aperture: z.number().positive().optional(),
      exposureTime: z.string().optional(),
      iso: z.number().int().positive().optional(),
    })
    .optional(),
  /** Only present when the author explicitly chose to keep the location. */
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      altitude: z.number().optional(),
    })
    .optional(),
});

export type EmbeddedMetadata = z.infer<typeof embeddedMetadataSchema>;
