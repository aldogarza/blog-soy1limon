import { siteConfig } from '@soy1limon/core';
import { describe, expect, it } from 'vitest';
import {
  fieldErrors,
  type ImageFormValues,
  imageFormSchema,
  parseKeywords,
  primaryAltText,
  toEmbeddedMetadata,
  valuesFromRecord,
  valuesFromSuggestion,
} from './image-form.ts';

const technical = {
  camera: { make: 'Apple', model: 'iPhone 18 Pro' },
  location: { latitude: 25.67, longitude: -100.37 },
  dateTaken: '2026-10-07T07:59:40-06:00',
};

const base: ImageFormValues = valuesFromSuggestion(
  {
    seoName: 'coffee-on-the-counter',
    metadata: { creator: 'Aldo Garza' },
    altText: 'A coffee cup',
  },
  siteConfig,
);

describe('imageFormSchema', () => {
  it('accepts the prefilled suggestion', () => {
    expect(imageFormSchema.safeParse(base).success).toBe(true);
  });

  it('requires alt text in at least one language and reports it on the English field', () => {
    const result = imageFormSchema.safeParse({ ...base, alt: { en: '', es: '' } });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(fieldErrors(result.error)['alt.en']).toMatch(/at least one language/);
  });

  it('explains how to write a valid file name', () => {
    const result = imageFormSchema.safeParse({ ...base, seoName: 'Mi Foto' });
    if (result.success) throw new Error('expected failure');
    expect(fieldErrors(result.error).seoName).toMatch(/lowercase letters/);
  });

  it('accepts an empty license URL but rejects non-http ones', () => {
    expect(imageFormSchema.safeParse({ ...base, licenseUrl: '' }).success).toBe(true);
    expect(imageFormSchema.safeParse({ ...base, licenseUrl: 'javascript:alert(1)' }).success).toBe(
      false,
    );
  });
});

describe('toEmbeddedMetadata', () => {
  it('drops empty fields, which is how a field is removed', () => {
    const metadata = toEmbeddedMetadata({ ...base, title: '', creditText: '' }, {});
    expect(metadata).not.toHaveProperty('title');
    expect(metadata).not.toHaveProperty('creditText');
    expect(metadata.creator).toBe('Aldo Garza');
  });

  it('keeps location, device and time when chosen', () => {
    const metadata = toEmbeddedMetadata(
      { ...base, keepCamera: true, keepLocation: true, keepDateTaken: true },
      technical,
    );
    expect(metadata.camera).toEqual(technical.camera);
    expect(metadata.location).toEqual(technical.location);
    expect(metadata.dateTaken).toBe(technical.dateTaken);
  });

  it('removes all technical data with the single switch, whatever the individual choices', () => {
    const metadata = toEmbeddedMetadata(
      { ...base, removeTechnical: true, keepCamera: true, keepLocation: true, keepDateTaken: true },
      technical,
    );
    expect(metadata).not.toHaveProperty('camera');
    expect(metadata).not.toHaveProperty('location');
    expect(metadata).not.toHaveProperty('dateTaken');
  });

  it('splits and dedupes keywords', () => {
    expect(parseKeywords(' coffee, monterrey ,coffee,, ')).toEqual(['coffee', 'monterrey']);
  });
});

describe('alt text', () => {
  it('embeds the default locale first, then any other', () => {
    expect(primaryAltText({ ...base, alt: { en: 'Coffee', es: 'Café' } }, 'en')).toBe('Coffee');
    expect(primaryAltText({ ...base, alt: { en: '', es: 'Café' } }, 'en')).toBe('Café');
  });
});

describe('valuesFromRecord', () => {
  it('reproduces the keep switches from what is stored', () => {
    const values = valuesFromRecord({
      seoName: 'coffee',
      metadata: { creator: 'Aldo Garza', location: technical.location },
      alt: { es: 'Café' },
      caption: {},
      watermark: false,
    });
    expect(values).toMatchObject({
      keepLocation: true,
      keepCamera: false,
      keepDateTaken: false,
      watermark: false,
      alt: { en: '', es: 'Café' },
    });
  });
});
