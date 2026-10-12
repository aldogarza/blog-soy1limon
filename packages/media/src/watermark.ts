import type { SiteConfig, WatermarkPosition } from '@soy1limon/core';

export type WatermarkConfig = SiteConfig['watermark'];

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function horizontal(position: WatermarkPosition): 'start' | 'middle' | 'end' {
  if (position.endsWith('left')) return 'start';
  if (position.endsWith('right')) return 'end';
  return 'middle';
}

function vertical(position: WatermarkPosition): 'top' | 'middle' | 'bottom' {
  if (position.startsWith('top')) return 'top';
  if (position.startsWith('bottom')) return 'bottom';
  return 'middle';
}

/**
 * Full-size transparent SVG with the watermark text, composited over a variant.
 * Size and margin scale with the variant width so the mark looks the same at every size.
 */
export function watermarkSvg(width: number, height: number, config: WatermarkConfig): Buffer {
  const fontSize = Math.max(config.minSizePx, Math.round(width * config.relativeSize));
  const margin = Math.round(width * config.marginRatio);
  const anchor = horizontal(config.position);
  const row = vertical(config.position);

  const x = anchor === 'start' ? margin : anchor === 'end' ? width - margin : width / 2;
  // Baseline positions approximate the font's ascent/descent; librsvg has no reliable dominant-baseline.
  const y =
    row === 'top'
      ? margin + fontSize * 0.8
      : row === 'bottom'
        ? height - margin - fontSize * 0.2
        : height / 2 + fontSize * 0.35;

  const strokeWidth = Math.max(1, fontSize * 0.06);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <text x="${x}" y="${y.toFixed(1)}" text-anchor="${anchor}"
    font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="600"
    fill="#ffffff" fill-opacity="${config.opacity}"
    stroke="#000000" stroke-opacity="${(config.opacity * 0.5).toFixed(2)}" stroke-width="${strokeWidth.toFixed(1)}"
    paint-order="stroke">${escapeXml(config.text)}</text>
</svg>`;
  return Buffer.from(svg);
}
