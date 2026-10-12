/** Cloudflare R2 free tier storage (10 GB-month); beyond it storage starts to cost money. */
export const R2_FREE_BYTES = 10 * 1000 ** 3;

interface ImageSize {
  originalBytes: number;
  variants: readonly { bytes: number }[];
}

/** Bytes stored for all images: originals (private bucket) plus every public variant. */
export function storageUsage(images: readonly ImageSize[]) {
  let originals = 0;
  let variants = 0;
  for (const image of images) {
    originals += image.originalBytes;
    for (const variant of image.variants) variants += variant.bytes;
  }
  const total = originals + variants;
  return { originals, variants, total, freeTierShare: total / R2_FREE_BYTES };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
