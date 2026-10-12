import type { SiteConfig } from '@soy1limon/core';
import sharp, { type Sharp } from 'sharp';
import { watermarkSvg, type WatermarkConfig } from './watermark.ts';

export interface RenderedVariant {
  width: number;
  height: number;
  body: Buffer;
}

/** Resizes, optionally watermarks and encodes one WebP variant (no metadata yet). */
export async function renderVariant(
  source: Sharp,
  width: number,
  options: { watermark: WatermarkConfig | null; media: SiteConfig['media'] },
): Promise<RenderedVariant> {
  // Resize to raw pixels first so the watermark overlay is built for the exact output size.
  const resized = await source
    .clone()
    .resize({ width, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = resized.info;

  let image = sharp(resized.data, { raw: { width: w, height: h, channels } });
  if (options.watermark) {
    image = image.composite([{ input: watermarkSvg(w, h, options.watermark), top: 0, left: 0 }]);
  }

  const body = await image
    .webp({
      quality: options.media.webpQuality,
      effort: options.media.webpEffort,
      smartSubsample: true,
    })
    .toBuffer();
  return { width: w, height: h, body };
}

/** Most frequent colour of the image, used as the placeholder background while it loads. */
export async function dominantColor(source: Sharp): Promise<string> {
  const { dominant } = await source.clone().resize(64).stats();
  const hex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`;
}
