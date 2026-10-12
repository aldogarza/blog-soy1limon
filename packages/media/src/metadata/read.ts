import type { EmbeddedMetadata } from '@soy1limon/core';
import { ExifDate, ExifDateTime, type Tags } from 'exiftool-vendored';
import { getExiftool } from '../exiftool.ts';

/** What a file already says about itself, normalized from EXIF, IPTC and XMP. */
export interface FileMetadata {
  metadata: EmbeddedMetadata;
  altText?: string;
}

// EXIF data comes from arbitrary files, so every value is treated as unknown and narrowed here.
type RawTags = Record<string, unknown>;

function text(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    const parts = value.map(text).filter((part) => part !== undefined);
    return parts.length > 0 ? parts.join('; ') : undefined;
  }
  return undefined;
}

function list(value: unknown): string[] | undefined {
  const items = Array.isArray(value)
    ? value.map(text)
    : (text(value)
        ?.split(/[;,]/)
        .map((item) => item.trim()) ?? []);
  const unique = [...new Set(items.filter((item): item is string => Boolean(item)))];
  return unique.length > 0 ? unique : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isoDate(value: unknown): string | undefined {
  if (value instanceof ExifDateTime || value instanceof ExifDate)
    return value.toISOString() ?? undefined;
  return undefined;
}

function exposure(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' && value > 0) {
    return value < 1 ? `1/${Math.round(1 / value)}` : String(value);
  }
  return undefined;
}

function first<T>(...values: (T | undefined)[]): T | undefined {
  return values.find((value) => value !== undefined);
}

function licensorUrl(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value) {
    if (typeof entry === 'object' && entry !== null && 'LicensorURL' in entry) {
      const url = text(entry.LicensorURL);
      if (url) return url;
    }
  }
  return undefined;
}

function validUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function dropEmpty<T extends object>(value: T): T | undefined {
  return Object.values(value).some((entry) => entry !== undefined) ? value : undefined;
}

/** Maps exiftool tags to our metadata shape, preferring XMP, then IPTC, then EXIF. */
export function normalizeTags(tags: Tags): FileMetadata {
  const t = tags as unknown as RawTags;

  const latitude = num(t.GPSLatitude);
  const longitude = num(t.GPSLongitude);
  const hasLocation =
    latitude !== undefined &&
    longitude !== undefined &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    // 0,0 is what some apps write when they have no fix.
    !(latitude === 0 && longitude === 0);

  const camera = dropEmpty({
    make: text(t.Make),
    model: text(t.Model),
    lens: first(text(t.LensModel), text(t.Lens)),
    focalLengthMm: num(t.FocalLength),
    aperture: num(t.FNumber),
    exposureTime: exposure(t.ExposureTime),
    iso: num(t.ISO),
  });

  const metadata: EmbeddedMetadata = {
    title: first(text(t.Title), text(t.ObjectName), text(t.XPTitle)),
    description: first(text(t.Description), text(t['Caption-Abstract']), text(t.ImageDescription)),
    creator: first(text(t.Creator), text(t['By-line']), text(t.Artist)),
    copyrightNotice: first(text(t.Rights), text(t.CopyrightNotice), text(t.Copyright)),
    creditText: text(t.Credit),
    licenseUrl: validUrl(first(text(t.WebStatement), licensorUrl(t.Licensor))),
    keywords: first(list(t.Subject), list(t.Keywords), list(t.XPKeywords)),
    dateTaken: first(isoDate(t.DateTimeOriginal), isoDate(t.DateCreated), isoDate(t.CreateDate)),
    camera: camera && {
      ...camera,
      iso: camera.iso === undefined ? undefined : Math.round(camera.iso),
    },
    location: hasLocation ? { latitude, longitude, altitude: num(t.GPSAltitude) } : undefined,
  };

  const altText = text(t.AltTextAccessibility);
  return {
    metadata: removeUndefined(metadata),
    ...(altText ? { altText } : {}),
  };
}

/** Keeps stored jsonb small and makes equality checks in tests predictable. */
export function removeUndefined<T extends object>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface SensitiveMatch {
  tag: string;
  value: string;
}

// File-system details describe our temp copy, not the photo.
const IGNORED_TAGS = new Set(['SourceFile', 'FileName', 'Directory', 'errors', 'warnings']);

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

/**
 * Finds configured private words (e.g. the author's name) anywhere in the file's metadata,
 * including tags we never copy, so the admin can warn before anything is published.
 */
export function findSensitiveTerms(tags: Tags, terms: readonly string[]): SensitiveMatch[] {
  const needles = terms.map((term) => term.toLocaleLowerCase()).filter(Boolean);
  if (needles.length === 0) return [];
  const matches: SensitiveMatch[] = [];
  for (const [tag, value] of Object.entries(tags as unknown as RawTags)) {
    if (IGNORED_TAGS.has(tag)) continue;
    for (const text of strings(value)) {
      const lower = text.toLocaleLowerCase();
      if (needles.some((needle) => lower.includes(needle))) {
        matches.push({ tag, value: text });
        break;
      }
    }
  }
  return matches;
}

export async function readFileTags(path: string): Promise<Tags> {
  return getExiftool().read(path);
}

export async function readFileMetadata(path: string): Promise<FileMetadata> {
  return normalizeTags(await readFileTags(path));
}
