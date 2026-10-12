import { siteConfig } from '@soy1limon/core';
import { describe, expect, it } from 'vitest';
import { watermarkSvg } from './watermark.ts';

const config = siteConfig.watermark;

describe('watermarkSvg', () => {
  it('escapes the text so it cannot inject SVG markup', () => {
    const svg = watermarkSvg(800, 600, { ...config, text: '<script>&"\'' }).toString();
    expect(svg).toContain('&lt;script&gt;&amp;&quot;&apos;');
    expect(svg).not.toContain('<script>');
  });

  it('anchors the text according to the position', () => {
    expect(watermarkSvg(800, 600, { ...config, position: 'bottom-right' }).toString()).toContain(
      'text-anchor="end"',
    );
    expect(watermarkSvg(800, 600, { ...config, position: 'top-left' }).toString()).toContain(
      'text-anchor="start"',
    );
    expect(watermarkSvg(800, 600, { ...config, position: 'center' }).toString()).toContain(
      'text-anchor="middle"',
    );
  });

  it('scales with the width but never below the minimum size', () => {
    expect(watermarkSvg(2000, 1000, config).toString()).toContain(
      `font-size="${Math.round(2000 * config.relativeSize)}"`,
    );
    expect(watermarkSvg(100, 100, config).toString()).toContain(`font-size="${config.minSizePx}"`);
  });
});
