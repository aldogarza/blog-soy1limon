import { createHash } from 'node:crypto';

/** First 8 hex chars of the SHA-256 of the final file (after metadata is written). */
export function contentHash(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 8);
}

/**
 * Public variants are content-addressed: any change (watermark, metadata, crop) produces a new key.
 * That is what makes `Cache-Control: immutable` safe, and the SEO name stays at the front for search engines.
 */
export function variantKey(input: {
  seoName: string;
  hash: string;
  width: number;
  year: number;
}): string {
  return `images/${input.year}/${input.seoName}-${input.hash}-${input.width}.webp`;
}

export function originalKey(id: string, ext: string): string {
  return `originals/${id}.${ext}`;
}

/** Widths to render: configured widths that fit, plus the original width when it is smaller than the largest. */
export function targetWidths(originalWidth: number, configuredWidths: readonly number[]): number[] {
  const widths = configuredWidths.filter((width) => width <= originalWidth);
  const largest = Math.max(...configuredWidths);
  if (originalWidth < largest && !widths.includes(originalWidth)) widths.push(originalWidth);
  return widths;
}
