import { fileTypeFromBuffer } from 'file-type';

/** Detected MIME type -> extension used for the stored original. */
export const ACCEPTED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/tiff': 'tif',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
} as const;

export type AcceptedMime = keyof typeof ACCEPTED_IMAGE_TYPES;

export interface DetectedImage {
  mime: AcceptedMime;
  ext: (typeof ACCEPTED_IMAGE_TYPES)[AcceptedMime];
  bytes: number;
}

export class UnsupportedImageError extends Error {
  override name = 'UnsupportedImageError';
}

function isAccepted(mime: string): mime is AcceptedMime {
  return Object.hasOwn(ACCEPTED_IMAGE_TYPES, mime);
}

/**
 * Decides the file type from its bytes (magic numbers), never from the name or the browser-reported
 * type. A text file renamed to `photo.jpg` is rejected; a PNG renamed to `.jpg` is treated as a PNG.
 */
export async function detectImage(buffer: Uint8Array, maxBytes: number): Promise<DetectedImage> {
  if (buffer.byteLength === 0) throw new UnsupportedImageError('The file is empty.');
  if (buffer.byteLength > maxBytes) {
    const limitMb = Math.round(maxBytes / 1024 / 1024);
    throw new UnsupportedImageError(`The file is larger than the ${limitMb} MB limit.`);
  }
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !isAccepted(detected.mime)) {
    throw new UnsupportedImageError(
      `Unsupported file type (${detected?.mime ?? 'unknown'}). Use JPEG, PNG, WebP, AVIF, TIFF, GIF or HEIC.`,
    );
  }
  return {
    mime: detected.mime,
    ext: ACCEPTED_IMAGE_TYPES[detected.mime],
    bytes: buffer.byteLength,
  };
}
