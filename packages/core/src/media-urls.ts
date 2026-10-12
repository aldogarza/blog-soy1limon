import type { ImageVariant } from './content.ts';

/** Public URL of a stored variant, e.g. https://img.example.com/images/2026/name-hash-800.webp */
export function mediaUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${key}`;
}

/** `srcset` listing every variant by width, so the browser downloads the smallest that fits. */
export function buildSrcset(variants: readonly ImageVariant[], baseUrl: string): string {
  return [...variants]
    .sort((a, b) => a.w - b.w)
    .map((variant) => `${mediaUrl(baseUrl, variant.key)} ${variant.w}w`)
    .join(', ');
}

/** Smallest variant at least `minWidth` wide, or the largest one if none is wide enough. */
export function pickVariant(
  variants: readonly ImageVariant[],
  minWidth: number,
): ImageVariant | undefined {
  const sorted = [...variants].sort((a, b) => a.w - b.w);
  return sorted.find((variant) => variant.w >= minWidth) ?? sorted.at(-1);
}

/**
 * Layout hint for `sizes`: images span the content column (max 48rem ≈ 768px), or the full
 * viewport on narrow screens.
 */
export const CONTENT_IMAGE_SIZES = '(min-width: 48rem) 48rem, 100vw';
