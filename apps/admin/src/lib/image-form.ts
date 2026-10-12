import {
  type EmbeddedMetadata,
  type LocalizedText,
  type Locale,
  LOCALES,
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
  type SiteConfig,
} from '@soy1limon/core';
import { z } from 'zod';

// Shared by the browser (instant validation) and the server (authoritative validation).
// Must stay free of Node-only imports.

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Use at most ${max} characters.` });

const perLocale = (max: number) => z.object({ en: text(max), es: text(max) });

export const imageFormSchema = z.object({
  seoName: z
    .string()
    .trim()
    .min(1, { error: 'Enter a file name.' })
    .max(SLUG_MAX_LENGTH, { error: `Use at most ${SLUG_MAX_LENGTH} characters.` })
    .regex(SLUG_PATTERN, {
      error: 'Use lowercase letters, numbers and single hyphens, e.g. "sunset-over-monterrey".',
    }),
  alt: perLocale(300).refine((alt) => Boolean(alt.en || alt.es), {
    error: 'Describe the image in at least one language.',
    path: ['en'],
  }),
  caption: perLocale(500),
  title: text(200),
  description: text(2000),
  creator: text(200),
  copyrightNotice: text(300),
  creditText: text(200),
  licenseUrl: z.union([
    z.literal(''),
    z.url({ protocol: /^https?$/, error: 'Enter a full http(s) address or leave it empty.' }),
  ]),
  /** Comma-separated in the form, an array in the file. */
  keywords: text(500),
  /** The single switch: removes location, device and capture time together. */
  removeTechnical: z.boolean(),
  keepCamera: z.boolean(),
  keepLocation: z.boolean(),
  keepDateTaken: z.boolean(),
  watermark: z.boolean(),
});

export type ImageFormValues = z.infer<typeof imageFormSchema>;

/** Technical data read from the original file; shown read-only and kept or removed by switches. */
export interface TechnicalMetadata {
  camera?: EmbeddedMetadata['camera'];
  location?: EmbeddedMetadata['location'];
  dateTaken?: string;
}

export function technicalFrom(metadata: EmbeddedMetadata): TechnicalMetadata {
  return {
    ...(metadata.camera ? { camera: metadata.camera } : {}),
    ...(metadata.location ? { location: metadata.location } : {}),
    ...(metadata.dateTaken ? { dateTaken: metadata.dateTaken } : {}),
  };
}

export function parseKeywords(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  ];
}

const localized = (value: { en: string; es: string }): LocalizedText => ({
  ...(value.en ? { en: value.en } : {}),
  ...(value.es ? { es: value.es } : {}),
});

const fromLocalized = (value: LocalizedText) => ({ en: value.en ?? '', es: value.es ?? '' });

/**
 * Exactly the metadata that will be embedded in the files. Empty fields are dropped (that is how
 * a field is removed); technical data comes from the original file and only if kept.
 */
export function toEmbeddedMetadata(
  values: ImageFormValues,
  technical: TechnicalMetadata,
): EmbeddedMetadata {
  const keywords = parseKeywords(values.keywords);
  const keep = (flag: boolean) => flag && !values.removeTechnical;
  return {
    ...(values.title ? { title: values.title } : {}),
    ...(values.description ? { description: values.description } : {}),
    ...(values.creator ? { creator: values.creator } : {}),
    ...(values.copyrightNotice ? { copyrightNotice: values.copyrightNotice } : {}),
    ...(values.creditText ? { creditText: values.creditText } : {}),
    ...(values.licenseUrl ? { licenseUrl: values.licenseUrl } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
    ...(keep(values.keepDateTaken) && technical.dateTaken
      ? { dateTaken: technical.dateTaken }
      : {}),
    ...(keep(values.keepCamera) && technical.camera ? { camera: technical.camera } : {}),
    ...(keep(values.keepLocation) && technical.location ? { location: technical.location } : {}),
  };
}

export const altText = (values: ImageFormValues) => localized(values.alt);
export const captionText = (values: ImageFormValues) => localized(values.caption);

/** Alt text embedded in the file: the default locale first, otherwise whichever exists. */
export function primaryAltText(values: ImageFormValues, defaultLocale: Locale): string | undefined {
  const order = [defaultLocale, ...LOCALES.filter((locale) => locale !== defaultLocale)];
  for (const locale of order) {
    const value = values.alt[locale];
    if (value) return value;
  }
  return undefined;
}

/** Form defaults for a new upload: suggestion from the file + site defaults. */
export function valuesFromSuggestion(
  suggestion: { seoName: string; metadata: EmbeddedMetadata; altText?: string },
  config: Pick<SiteConfig, 'imageDefaults' | 'watermark' | 'defaultLocale'>,
): ImageFormValues {
  const m = suggestion.metadata;
  return {
    seoName: suggestion.seoName,
    alt: { en: '', es: '', [config.defaultLocale]: suggestion.altText ?? '' },
    caption: { en: '', es: '' },
    title: m.title ?? '',
    description: m.description ?? '',
    creator: m.creator ?? '',
    copyrightNotice: m.copyrightNotice ?? '',
    creditText: m.creditText ?? '',
    licenseUrl: m.licenseUrl ?? '',
    keywords: (m.keywords ?? []).join(', '),
    removeTechnical: false,
    keepCamera: config.imageDefaults.keepCameraInfo,
    keepLocation: config.imageDefaults.keepLocation,
    keepDateTaken: true,
    watermark: config.watermark.enabledByDefault,
  };
}

/** Form values that reproduce a stored image, for editing. */
export function valuesFromRecord(record: {
  seoName: string;
  metadata: EmbeddedMetadata;
  alt: LocalizedText;
  caption: LocalizedText;
  watermark: boolean;
}): ImageFormValues {
  const m = record.metadata;
  return {
    seoName: record.seoName,
    alt: fromLocalized(record.alt),
    caption: fromLocalized(record.caption),
    title: m.title ?? '',
    description: m.description ?? '',
    creator: m.creator ?? '',
    copyrightNotice: m.copyrightNotice ?? '',
    creditText: m.creditText ?? '',
    licenseUrl: m.licenseUrl ?? '',
    keywords: (m.keywords ?? []).join(', '),
    removeTechnical: false,
    keepCamera: Boolean(m.camera),
    keepLocation: Boolean(m.location),
    keepDateTaken: Boolean(m.dateTaken),
    watermark: record.watermark,
  };
}

/** Fields that the "apply to remaining images" button copies. */
export const SHARED_FIELDS = [
  'creator',
  'copyrightNotice',
  'creditText',
  'licenseUrl',
  'keywords',
] as const;

/** Maps zod issues to `{ fieldId: message }`, using dotted paths like `alt.en`. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    errors[key] ??= issue.message;
  }
  return errors;
}
