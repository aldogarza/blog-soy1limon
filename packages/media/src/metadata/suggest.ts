import { type EmbeddedMetadata, type SiteConfig, slugify } from '@soy1limon/core';
import type { FileMetadata } from './read.ts';
import { removeUndefined } from './read.ts';

export interface MetadataSuggestion {
  seoName: string;
  metadata: EmbeddedMetadata;
  altText?: string;
}

function yearOf(isoDate: string | undefined): number {
  const year = isoDate ? Number.parseInt(isoDate.slice(0, 4), 10) : Number.NaN;
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function baseName(filename: string): string {
  const name = filename.split(/[\\/]/).pop() ?? filename;
  return name.replace(/\.[^.]+$/, '');
}

/**
 * Prefills the upload form: what the file already says wins, site defaults fill the gaps.
 * Camera info and location follow the site defaults (location is off unless explicitly enabled).
 */
export function suggestMetadata(
  file: FileMetadata,
  filename: string,
  config: Pick<SiteConfig, 'imageDefaults'>,
): MetadataSuggestion {
  const defaults = config.imageDefaults;
  const found = file.metadata;
  const copyrightFromDefaults = defaults.copyrightNotice.replaceAll(
    '{year}',
    String(yearOf(found.dateTaken)),
  );

  const metadata = removeUndefined<EmbeddedMetadata>({
    title: found.title,
    description: found.description,
    creator: found.creator ?? defaults.creator,
    copyrightNotice: found.copyrightNotice ?? copyrightFromDefaults,
    creditText: found.creditText ?? defaults.creditText,
    licenseUrl: found.licenseUrl ?? defaults.licenseUrl ?? undefined,
    keywords: found.keywords,
    dateTaken: found.dateTaken,
    camera: defaults.keepCameraInfo ? found.camera : undefined,
    location: defaults.keepLocation ? found.location : undefined,
  });

  const seoName = slugify(found.title ?? baseName(filename)) || 'image';
  return { seoName, metadata, ...(file.altText ? { altText: file.altText } : {}) };
}
