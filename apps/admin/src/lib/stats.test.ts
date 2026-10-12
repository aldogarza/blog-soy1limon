import { describe, expect, it } from 'vitest';
import { formatBytes, R2_FREE_BYTES, storageUsage } from './stats.ts';

describe('storageUsage', () => {
  it('adds originals and variants and compares with the free tier', () => {
    const usage = storageUsage([
      { originalBytes: 3_000_000, variants: [{ bytes: 20_000 }, { bytes: 80_000 }] },
      { originalBytes: 1_000_000, variants: [] },
    ]);
    expect(usage).toEqual({
      originals: 4_000_000,
      variants: 100_000,
      total: 4_100_000,
      freeTierShare: 4_100_000 / R2_FREE_BYTES,
    });
  });
});

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [1_500, '1.5 kB'],
    [2_400_000, '2.4 MB'],
    [10_000_000_000, '10 GB'],
  ])('%i -> %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
