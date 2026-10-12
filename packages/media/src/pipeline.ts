import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type EmbeddedMetadata,
  type ImageVariant,
  isSlug,
  type SiteConfig,
  siteConfig,
} from '@soy1limon/core';
import { openImage } from './decode.ts';
import { type AcceptedMime, detectImage } from './intake.ts';
import { contentHash, originalKey, targetWidths, variantKey } from './keys.ts';
import { type FileMetadata, readFileMetadata } from './metadata/read.ts';
import { type MetadataSuggestion, suggestMetadata } from './metadata/suggest.ts';
import { profileForWidth, writeMetadata } from './metadata/write.ts';
import { dominantColor, renderVariant } from './render.ts';
import type { MediaStorage } from './storage/types.ts';

export interface ImageInput {
  buffer: Buffer;
  /** Original file name; only used to suggest an SEO name, never to decide the type. */
  filename: string;
}

export interface InspectedImage {
  mime: AcceptedMime;
  ext: string;
  bytes: number;
  width: number;
  height: number;
  /** Exactly what the file contains (the form shows it, e.g. to warn about GPS data). */
  file: FileMetadata;
  /** Prefilled form values: file metadata merged with the site defaults. */
  suggestion: MetadataSuggestion;
}

export interface ProcessOptions {
  id: string;
  seoName: string;
  /** Final metadata chosen in the form; exactly these fields are embedded. */
  metadata: EmbeddedMetadata;
  altText?: string;
  watermark: boolean;
  /** Year folder of the public keys; defaults to the current year. */
  year?: number;
  /** Set when re-rendering from an original that is already stored. */
  originalKey?: string;
}

export interface ProcessedImage {
  width: number;
  height: number;
  dominantColor: string;
  variants: ImageVariant[];
  original: { key: string; mime: AcceptedMime; bytes: number };
}

async function withTempDir<T>(task: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'soy1limon-media-'));
  try {
    return await task(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Validates the file and reads what the upload form needs, without storing anything. */
export async function inspectImage(
  input: ImageInput,
  config: SiteConfig = siteConfig,
): Promise<InspectedImage> {
  const detected = await detectImage(input.buffer, config.media.maxUploadBytes);
  const opened = await openImage(input.buffer, detected.mime, config.media.maxInputPixels);
  const file = await withTempDir(async (dir) => {
    const path = join(dir, `input.${detected.ext}`);
    await writeFile(path, input.buffer);
    return readFileMetadata(path);
  });
  return {
    ...detected,
    width: opened.width,
    height: opened.height,
    file,
    suggestion: suggestMetadata(file, input.filename, config),
  };
}

/**
 * Stores the original (private), renders every WebP variant with watermark and metadata, and uploads
 * them (public). If anything fails, whatever was uploaded in this call is removed again.
 */
export async function processImage(
  input: ImageInput,
  options: ProcessOptions,
  storage: MediaStorage,
  config: SiteConfig = siteConfig,
): Promise<ProcessedImage> {
  if (!isSlug(options.seoName)) {
    throw new Error(
      `Invalid SEO name ${JSON.stringify(options.seoName)}: use lowercase words separated by hyphens.`,
    );
  }
  const detected = await detectImage(input.buffer, config.media.maxUploadBytes);
  const opened = await openImage(input.buffer, detected.mime, config.media.maxInputPixels);
  const year = options.year ?? new Date().getUTCFullYear();
  const storedOriginalKey = options.originalKey ?? originalKey(options.id, detected.ext);

  const uploadedPublic: string[] = [];
  let uploadedOriginal = false;
  try {
    if (!options.originalKey) {
      await storage.putOriginal(storedOriginalKey, input.buffer, detected.mime);
      uploadedOriginal = true;
    }

    const variants = await withTempDir(async (dir) => {
      const results: ImageVariant[] = [];
      for (const width of targetWidths(opened.width, config.media.widths)) {
        const rendered = await renderVariant(opened.pipeline, width, {
          watermark: options.watermark ? config.watermark : null,
          media: config.media,
        });
        const path = join(dir, `${rendered.width}.webp`);
        await writeFile(path, rendered.body);
        await writeMetadata(
          path,
          options.metadata,
          options.altText,
          profileForWidth(rendered.width),
        );

        const body = await readFile(path);
        const key = variantKey({
          seoName: options.seoName,
          hash: contentHash(body),
          width: rendered.width,
          year,
        });
        await storage.putPublic(key, body, 'image/webp');
        uploadedPublic.push(key);
        results.push({ w: rendered.width, h: rendered.height, bytes: body.byteLength, key });
      }
      return results;
    });

    return {
      width: opened.width,
      height: opened.height,
      dominantColor: await dominantColor(opened.pipeline),
      variants,
      original: { key: storedOriginalKey, mime: detected.mime, bytes: detected.bytes },
    };
  } catch (error) {
    // Best effort: the original error matters more than a failed clean-up.
    await storage.deletePublic(uploadedPublic).catch(() => undefined);
    if (uploadedOriginal) await storage.deleteOriginal(storedOriginalKey).catch(() => undefined);
    throw error;
  }
}

/**
 * Renders new variants from the stored original, e.g. after a watermark, metadata or SEO-name change.
 * The old public keys are left alone; the caller decides when to retire them.
 */
export async function reprocessImage(
  stored: { originalKey: string; originalFilename: string },
  options: Omit<ProcessOptions, 'originalKey'>,
  storage: MediaStorage,
  config: SiteConfig = siteConfig,
): Promise<ProcessedImage> {
  const buffer = await storage.getOriginal(stored.originalKey);
  return processImage(
    { buffer, filename: stored.originalFilename },
    { ...options, originalKey: stored.originalKey },
    storage,
    config,
  );
}
