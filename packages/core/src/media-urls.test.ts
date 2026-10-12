import { describe, expect, it } from 'vitest';
import { buildSrcset, mediaUrl, pickVariant } from './media-urls.ts';

const variants = [
  { w: 800, h: 533, bytes: 1, key: 'images/2026/a-2-800.webp' },
  { w: 400, h: 267, bytes: 1, key: 'images/2026/a-1-400.webp' },
  { w: 1200, h: 800, bytes: 1, key: 'images/2026/a-3-1200.webp' },
];

describe('media urls', () => {
  it('joins base and key without double slashes', () => {
    expect(mediaUrl('https://img.example.com/', 'images/x.webp')).toBe(
      'https://img.example.com/images/x.webp',
    );
  });

  it('builds a width-ordered srcset', () => {
    expect(buildSrcset(variants, 'https://img.example.com')).toBe(
      'https://img.example.com/images/2026/a-1-400.webp 400w, https://img.example.com/images/2026/a-2-800.webp 800w, https://img.example.com/images/2026/a-3-1200.webp 1200w',
    );
  });

  it('picks the smallest variant that is wide enough, or the largest', () => {
    expect(pickVariant(variants, 600)?.w).toBe(800);
    expect(pickVariant(variants, 1200)?.w).toBe(1200);
    expect(pickVariant(variants, 5000)?.w).toBe(1200);
    expect(pickVariant([], 100)).toBeUndefined();
  });
});
