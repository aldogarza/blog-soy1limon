import type { EmbeddedMetadata } from '@soy1limon/core';
import type { WriteTags } from 'exiftool-vendored';
import { getExiftool } from '../exiftool.ts';

/**
 * `full` goes into large variants (the ones people download); `compact` keeps small variants light
 * while still carrying authorship, copyright and license.
 */
export type MetadataProfile = 'full' | 'compact';

export const FULL_METADATA_MIN_WIDTH = 1200;

export function profileForWidth(width: number): MetadataProfile {
  return width >= FULL_METADATA_MIN_WIDTH ? 'full' : 'compact';
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

function exifDate(iso: string): { dateTime: string; offset?: string } | undefined {
  const match = ISO_DATE.exec(iso);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, zone] = match;
  const offset = zone === 'Z' ? '+00:00' : zone;
  return {
    dateTime: `${year}:${month}:${day} ${hour}:${minute}:${second}`,
    ...(offset ? { offset } : {}),
  };
}

/** Translates our metadata into exiftool tags (group-qualified so each value lands in the intended block). */
export function buildWriteTags(
  metadata: EmbeddedMetadata,
  altText: string | undefined,
  profile: MetadataProfile,
): Record<string, string | number | string[]> {
  // Sharp converts every variant to sRGB; without this exiftool would record "Uncalibrated".
  const tags: Record<string, string | number | string[]> = { ColorSpace: 'sRGB' };
  const set = (key: string, value: string | number | string[] | undefined) => {
    if (value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
      tags[key] = value;
    }
  };

  set('XMP-dc:Creator', metadata.creator ? [metadata.creator] : undefined);
  set('Artist', metadata.creator);
  set('XMP-dc:Rights', metadata.copyrightNotice);
  set('Copyright', metadata.copyrightNotice);
  set('XMP-photoshop:Credit', metadata.creditText);
  set('XMP-xmpRights:WebStatement', metadata.licenseUrl);
  set('XMP-plus:LicensorURL', metadata.licenseUrl);

  if (profile === 'compact') return tags;

  set('XMP-dc:Title', metadata.title);
  set('XPTitle', metadata.title);
  set('XMP-dc:Description', metadata.description);
  set('ImageDescription', metadata.description);
  set('XMP-dc:Subject', metadata.keywords);
  set('XPKeywords', metadata.keywords?.join(';'));
  set('XMP-iptcCore:AltTextAccessibility', altText);

  if (metadata.dateTaken) {
    const date = exifDate(metadata.dateTaken);
    if (date) {
      set('DateTimeOriginal', date.dateTime);
      set('OffsetTimeOriginal', date.offset);
      set('XMP-photoshop:DateCreated', metadata.dateTaken);
    }
  }

  const camera = metadata.camera;
  if (camera) {
    set('Make', camera.make);
    set('Model', camera.model);
    set('LensModel', camera.lens);
    set('FocalLength', camera.focalLengthMm);
    set('FNumber', camera.aperture);
    set('ExposureTime', camera.exposureTime);
    set('ISO', camera.iso);
  }

  const location = metadata.location;
  if (location) {
    // Signed decimals on purpose: exiftool-vendored derives the N/S/E/W and altitude references
    // from the sign (and also writes GPSPosition from these values). Passing absolute values plus
    // explicit refs gets the hemisphere silently flipped.
    set('GPSLatitude', location.latitude);
    set('GPSLongitude', location.longitude);
    set('GPSAltitude', location.altitude);
  }

  return tags;
}

// -overwrite_original: no "file_original" backups. Compact=All: drops the ~2 KB of XMP padding
// exiftool reserves for in-place edits, which only costs visitors bandwidth.
const WRITE_ARGS = ['-overwrite_original', '-api', 'Compact=All'];

/** Writes metadata into a file that has none (Sharp strips everything on encode). */
export async function writeMetadata(
  path: string,
  metadata: EmbeddedMetadata,
  altText: string | undefined,
  profile: MetadataProfile,
): Promise<void> {
  const tags = buildWriteTags(metadata, altText, profile);
  // Group-qualified keys ("XMP-dc:Title") are valid exiftool tags but outside the library's typed keys.
  const result = await getExiftool().write(path, tags as WriteTags, { writeArgs: WRITE_ARGS });
  if (result.warnings && result.warnings.length > 0) {
    throw new Error(`exiftool could not write every tag: ${result.warnings.join('; ')}`);
  }
}
