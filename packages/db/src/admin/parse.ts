import {
  embeddedMetadataSchema,
  IMAGE_STATUSES,
  imageVariantsSchema,
  LOCALES,
  localizedTextSchema,
  POST_STATUSES,
} from '@soy1limon/core';
import { z } from 'zod';

// Rows written by the admin itself are trusted structurally, but jsonb and text-with-check
// columns arrive untyped from PostgREST; these parsers give them their real types.
export const parseLocale = (value: string) => z.enum(LOCALES).parse(value);
export const parsePostStatus = (value: string) => z.enum(POST_STATUSES).parse(value);
export const parseImageStatus = (value: string) => z.enum(IMAGE_STATUSES).parse(value);
export const parseLocalizedText = (value: unknown) => localizedTextSchema.parse(value);
export const parseVariants = (value: unknown) => imageVariantsSchema.parse(value);
export const parseMetadata = (value: unknown) => embeddedMetadataSchema.parse(value);
