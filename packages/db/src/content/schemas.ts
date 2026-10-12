import {
  embeddedMetadataSchema,
  imageVariantSchema,
  LOCALES,
  localizedTextSchema,
  slugSchema,
} from '@soy1limon/core';
import { z } from 'zod';

const timestamp = z.iso.datetime({ offset: true });

/** A post as the public site sees it: published, dated in the past, fully validated. */
export const publishedPostSchema = z.object({
  id: z.uuid(),
  lang: z.enum(LOCALES),
  slug: slugSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  bodyMd: z.string(),
  publishedAt: timestamp,
  updatedAt: timestamp,
  translationKey: z.uuid().nullable(),
  previousSlugs: z.array(slugSchema),
  coverImageId: z.uuid().nullable(),
  tagIds: z.array(z.uuid()),
  /** Gallery image ids in display order. */
  galleryImageIds: z.array(z.uuid()),
  /** Images referenced inside the Markdown body. */
  inlineImageIds: z.array(z.uuid()),
});

export type PublishedPost = z.infer<typeof publishedPostSchema>;

export const tagSchema = z.object({
  id: z.uuid(),
  slug: slugSchema,
  labels: localizedTextSchema,
});

export type Tag = z.infer<typeof tagSchema>;

/** Only the columns the publishable key is allowed to read. */
export const publicImageSchema = z.object({
  id: z.uuid(),
  seoName: slugSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  dominantColor: z.string().nullable(),
  variants: z.array(imageVariantSchema).nonempty(),
  metadata: embeddedMetadataSchema,
  alt: localizedTextSchema,
  caption: localizedTextSchema,
  updatedAt: timestamp,
});

export type PublicImage = z.infer<typeof publicImageSchema>;

export const publishedContentSchema = z.object({
  posts: z.array(publishedPostSchema),
  tags: z.array(tagSchema),
  images: z.array(publicImageSchema),
});

export type PublishedContent = z.infer<typeof publishedContentSchema>;

export class ContentValidationError extends Error {
  override name = 'ContentValidationError';
}

/** Parses content and fails loudly: a broken row must stop the build, not ship a broken page. */
export function parsePublishedContent(input: unknown, source: string): PublishedContent {
  const result = publishedContentSchema.safeParse(input);
  if (result.success) return result.data;
  const problems = result.error.issues
    .slice(0, 20)
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new ContentValidationError(`Invalid content from ${source}:\n${problems}`);
}
