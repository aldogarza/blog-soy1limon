import decodeHeic from 'heic-decode';
import sharp, { type Sharp } from 'sharp';
import type { AcceptedMime } from './intake.ts';

export interface OpenedImage {
  /** Auto-oriented pipeline; clone it for every variant. */
  pipeline: Sharp;
  /** Dimensions as displayed (after EXIF orientation). */
  width: number;
  height: number;
}

async function openWithSharp(buffer: Buffer, maxInputPixels: number): Promise<OpenedImage> {
  // `animated: false` keeps only the first frame of GIFs; `rotate()` applies EXIF orientation.
  const pipeline = sharp(buffer, { limitInputPixels: maxInputPixels, animated: false }).rotate();
  const meta = await pipeline.metadata();
  const width = meta.autoOrient.width;
  const height = meta.autoOrient.height;
  if (!width || !height) throw new Error('Could not read the image dimensions.');
  return { pipeline, width, height };
}

/**
 * iPhone HEIC files use HEVC, which Sharp's prebuilt binaries cannot decode (patent licensing).
 * libheif compiled to WebAssembly decodes them instead and already applies the HEIF rotation.
 */
async function openHeic(buffer: Buffer, maxInputPixels: number): Promise<OpenedImage> {
  const { width, height, data } = await decodeHeic({ buffer });
  if (width * height > maxInputPixels) throw new Error('The image has too many pixels.');
  const pipeline = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels: 4 },
  });
  return { pipeline, width, height };
}

export async function openImage(
  buffer: Buffer,
  mime: AcceptedMime,
  maxInputPixels: number,
): Promise<OpenedImage> {
  if (mime !== 'image/heic' && mime !== 'image/heif') return openWithSharp(buffer, maxInputPixels);
  try {
    const opened = await openWithSharp(buffer, maxInputPixels);
    // metadata() succeeds even without an HEVC decoder; decoding a tiny thumbnail proves it works.
    await opened.pipeline.clone().resize(8).raw().toBuffer();
    return opened;
  } catch {
    return openHeic(buffer, maxInputPixels);
  }
}
