import { describe, expect, it } from 'vitest';
import { contentHash, originalKey, targetWidths, variantKey } from './keys.ts';

const WIDTHS = [400, 800, 1200, 1600, 2000];

describe('targetWidths', () => {
  it.each([
    [4000, [400, 800, 1200, 1600, 2000]],
    [2000, [400, 800, 1200, 1600, 2000]],
    [1000, [400, 800, 1000]],
    [800, [400, 800]],
    [300, [300]],
  ])('original %i px -> %j (never upscales)', (original, expected) => {
    expect(targetWidths(original, WIDTHS)).toEqual(expected);
  });
});

describe('keys', () => {
  it('puts the SEO name first and the content hash before the width', () => {
    expect(variantKey({ seoName: 'sunset', hash: 'abcd1234', width: 800, year: 2026 })).toBe(
      'images/2026/sunset-abcd1234-800.webp',
    );
  });

  it('stores originals by id', () => {
    expect(originalKey('0f1e', 'heic')).toBe('originals/0f1e.heic');
  });

  it('hashes content deterministically and changes with any byte', () => {
    const a = contentHash(Buffer.from('abc'));
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(contentHash(Buffer.from('abc'))).toBe(a);
    expect(contentHash(Buffer.from('abd'))).not.toBe(a);
  });
});
