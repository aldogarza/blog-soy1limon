import { siteConfig } from '@soy1limon/core';
import { ExifDateTime, type Tags } from 'exiftool-vendored';
import { describe, expect, it } from 'vitest';
import { findSensitiveTerms, normalizeTags } from './read.ts';
import { suggestMetadata } from './suggest.ts';
import { buildWriteTags, profileForWidth } from './write.ts';

const tags = (value: Record<string, unknown>) => value as unknown as Tags;

describe('normalizeTags', () => {
  it('prefers XMP over IPTC over EXIF', () => {
    const { metadata } = normalizeTags(
      tags({
        Title: 'xmp',
        ObjectName: 'iptc',
        XPTitle: 'exif',
        Artist: 'exif artist',
        Creator: ['A', 'B'],
      }),
    );
    expect(metadata.title).toBe('xmp');
    expect(metadata.creator).toBe('A; B');
  });

  it('reads signed GPS coordinates and ignores the 0,0 "no fix" value', () => {
    expect(
      normalizeTags(tags({ GPSLatitude: 25.68, GPSLongitude: -100.31 })).metadata.location,
    ).toEqual({
      latitude: 25.68,
      longitude: -100.31,
    });
    expect(
      normalizeTags(tags({ GPSLatitude: 0, GPSLongitude: 0 })).metadata.location,
    ).toBeUndefined();
  });

  it('normalizes camera values from strings and numbers', () => {
    const { metadata } = normalizeTags(
      tags({ Make: 'Apple', FocalLength: '6.9 mm', ExposureTime: 0.008, ISO: 50 }),
    );
    expect(metadata.camera).toEqual({
      make: 'Apple',
      focalLengthMm: 6.9,
      exposureTime: '1/125',
      iso: 50,
    });
  });

  it('splits keyword strings, dedupes them and reads the license from PLUS licensor', () => {
    const { metadata } = normalizeTags(
      tags({
        XPKeywords: 'sun; sky;sun',
        Licensor: [{ LicensorURL: 'https://example.com/license' }],
      }),
    );
    expect(metadata.keywords).toEqual(['sun', 'sky']);
    expect(metadata.licenseUrl).toBe('https://example.com/license');
  });

  it('drops license URLs that are not http(s)', () => {
    expect(
      normalizeTags(tags({ WebStatement: 'javascript:alert(1)' })).metadata.licenseUrl,
    ).toBeUndefined();
  });

  it('converts capture dates to ISO strings with their offset', () => {
    const date = ExifDateTime.fromEXIF('2026:03:14 18:22:05-06:00');
    expect(normalizeTags(tags({ DateTimeOriginal: date })).metadata.dateTaken).toBe(
      '2026-03-14T18:22:05-06:00',
    );
  });

  it('reads the IPTC accessibility alt text', () => {
    expect(normalizeTags(tags({ AltTextAccessibility: 'A dog' })).altText).toBe('A dog');
  });
});

describe('suggestMetadata', () => {
  it('keeps what the file says and fills gaps with site defaults', () => {
    const suggestion = suggestMetadata(
      {
        metadata: { title: 'Mi foto', creator: 'Someone Else', dateTaken: '2024-05-01T10:00:00Z' },
      },
      'IMG_0001.HEIC',
      siteConfig,
    );
    expect(suggestion.metadata.creator).toBe('Someone Else');
    expect(suggestion.metadata.creditText).toBe(siteConfig.imageDefaults.creditText);
    expect(suggestion.metadata.copyrightNotice).toBe('© 2024 Aldo. All rights reserved.');
    expect(suggestion.seoName).toBe('mi-foto');
  });

  it('keeps or drops the location according to the site defaults', () => {
    const file = { metadata: { location: { latitude: 1, longitude: 2 } } };
    const keep = { imageDefaults: { ...siteConfig.imageDefaults, keepLocation: true } };
    const drop = { imageDefaults: { ...siteConfig.imageDefaults, keepLocation: false } };
    expect(suggestMetadata(file, 'photo.jpg', keep).metadata.location).toEqual({
      latitude: 1,
      longitude: 2,
    });
    expect(suggestMetadata(file, 'photo.jpg', drop).metadata.location).toBeUndefined();
  });

  it('falls back to the file name for the SEO name', () => {
    expect(
      suggestMetadata({ metadata: {} }, 'C:\\fotos\\Playa Bonita.JPG', siteConfig).seoName,
    ).toBe('playa-bonita');
  });
});

describe('buildWriteTags', () => {
  const metadata = {
    title: 'Sunset',
    creator: 'Aldo',
    copyrightNotice: '© 2026 Aldo',
    licenseUrl: 'https://example.com/license',
    keywords: ['sun', 'sky'],
    dateTaken: '2026-03-14T18:22:05-06:00',
    location: { latitude: -33.4, longitude: -70.6, altitude: -5 },
  };

  it('writes only authorship, copyright and license in the compact profile', () => {
    const written = buildWriteTags(metadata, 'alt', 'compact');
    expect(written['XMP-dc:Creator']).toEqual(['Aldo']);
    expect(written['XMP-plus:LicensorURL']).toBe('https://example.com/license');
    expect(written['XMP-dc:Title']).toBeUndefined();
    expect(written.GPSLatitude).toBeUndefined();
    expect(written.ColorSpace).toBe('sRGB');
  });

  it('writes everything in the full profile, with signed coordinates', () => {
    const written = buildWriteTags(metadata, 'An orange sky', 'full');
    expect(written['XMP-iptcCore:AltTextAccessibility']).toBe('An orange sky');
    expect(written.XPKeywords).toBe('sun;sky');
    expect(written.DateTimeOriginal).toBe('2026:03:14 18:22:05');
    expect(written.OffsetTimeOriginal).toBe('-06:00');
    expect(written.GPSLatitude).toBe(-33.4);
    expect(written.GPSLongitude).toBe(-70.6);
    expect(written.GPSAltitude).toBe(-5);
    // References are derived from the sign by exiftool-vendored; setting them here caused flips.
    expect(written.GPSLongitudeRef).toBeUndefined();
  });

  it('never writes empty values', () => {
    const written = buildWriteTags({ title: '', keywords: [] }, undefined, 'full');
    expect(Object.keys(written)).toEqual(['ColorSpace']);
  });

  it('uses the full profile from 1200 px', () => {
    expect(profileForWidth(800)).toBe('compact');
    expect(profileForWidth(1200)).toBe('full');
  });
});

describe('findSensitiveTerms', () => {
  it('finds a private term in any tag, case-insensitively, including nested values', () => {
    const matches = findSensitiveTerms(
      tags({ HostComputer: "aldo's iPhone", Keywords: ['beach', 'ALDO'], Make: 'Apple' }),
      ['Aldo'],
    );
    expect(matches).toEqual([
      { tag: 'HostComputer', value: "aldo's iPhone" },
      { tag: 'Keywords', value: 'ALDO' },
    ]);
  });

  it('ignores file-system tags of the temporary copy', () => {
    expect(
      findSensitiveTerms(tags({ SourceFile: '/tmp/aldo/x.jpg', FileName: 'aldo.jpg' }), ['aldo']),
    ).toEqual([]);
  });

  it('returns nothing without configured terms', () => {
    expect(findSensitiveTerms(tags({ Artist: 'Aldo' }), [])).toEqual([]);
  });
});
