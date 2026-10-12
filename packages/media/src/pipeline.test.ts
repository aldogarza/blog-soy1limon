import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { siteConfig } from '@soy1limon/core';
import sharp, { type Region } from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFixtures, type Fixtures, solidJpeg } from '../test/fixtures.ts';
import { run as runCli } from './cli.ts';
import { closeExiftool, getExiftool } from './exiftool.ts';
import { UnsupportedImageError } from './intake.ts';
import { profileForWidth } from './metadata/write.ts';
import { inspectImage, processImage, reprocessImage } from './pipeline.ts';
import { renderVariant } from './render.ts';
import { createLocalFsStorage } from './storage/local-fs.ts';
import type { MediaStorage } from './storage/types.ts';

let fx: Fixtures;
let storage: MediaStorage;
let root: string;

beforeAll(async () => {
  fx = await createFixtures();
  root = join(fx.dir, 'storage');
  storage = createLocalFsStorage({ root, publicBaseUrl: 'http://127.0.0.1:4322/media' });
});

afterAll(async () => {
  await closeExiftool();
  await fx.cleanup();
});

const publicFile = (key: string) => join(root, 'public', key);
// Group-qualified names ("XMP-dc:Title") are not part of the library's typed Tags.
const readTags = async (key: string): Promise<Record<string, unknown>> => ({
  ...(await getExiftool().readRaw(publicFile(key), { readArgs: ['-G1', '-a'] })),
});

async function processFixture(
  buffer: Buffer,
  overrides: Partial<Parameters<typeof processImage>[1]> = {},
) {
  const inspected = await inspectImage({ buffer, filename: 'IMG_1234.jpg' });
  return processImage(
    { buffer, filename: 'IMG_1234.jpg' },
    {
      id: crypto.randomUUID(),
      seoName: inspected.suggestion.seoName,
      metadata: inspected.suggestion.metadata,
      altText: 'Orange sunset over the hills',
      watermark: true,
      year: 2026,
      ...overrides,
    },
    storage,
  );
}

describe('inspectImage', () => {
  it('prefills the form from the file and reports GPS without suggesting to keep it', async () => {
    const inspected = await inspectImage({ buffer: fx.phoneJpeg, filename: 'IMG_1234.jpg' });
    expect(inspected).toMatchObject({ mime: 'image/jpeg', width: 1600, height: 2400 });
    expect(inspected.file.metadata.location?.latitude).toBeCloseTo(25.6866, 3);
    expect(inspected.file.metadata.location?.longitude).toBeCloseTo(-100.3161, 3);
    expect(inspected.suggestion.seoName).toBe('atardecer-en-monterrey');
    expect(inspected.suggestion.metadata.location).toBeUndefined();
    expect(inspected.suggestion.metadata.camera).toMatchObject({
      make: 'Apple',
      model: 'iPhone 15',
    });
    expect(inspected.suggestion.metadata.creator).toBe(siteConfig.imageDefaults.creator);
  });

  it('rejects a lying extension (text named .jpg)', async () => {
    await expect(
      inspectImage({ buffer: fx.textAsJpeg, filename: 'photo.jpg' }),
    ).rejects.toBeInstanceOf(UnsupportedImageError);
  });
});

describe('processImage', () => {
  it('applies EXIF orientation and never upscales', async () => {
    const result = await processFixture(fx.phoneJpeg);
    expect([result.width, result.height]).toEqual([1600, 2400]);
    expect(result.variants.map((v) => [v.w, v.h])).toEqual([
      [400, 600],
      [800, 1200],
      [1200, 1800],
      [1600, 2400],
    ]);
  });

  it('outputs real WebP files under SEO-friendly, content-addressed keys', async () => {
    const result = await processFixture(fx.phoneJpeg);
    for (const variant of result.variants) {
      expect(variant.key).toMatch(
        new RegExp(`^images/2026/atardecer-en-monterrey-[0-9a-f]{8}-${variant.w}\\.webp$`),
      );
      const meta = await sharp(publicFile(variant.key)).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(variant.w);
    }
    expect(result.original.key).toMatch(/^originals\/[0-9a-f-]{36}\.jpg$/);
    expect(await storage.getOriginal(result.original.key)).toEqual(fx.phoneJpeg);
  });

  it('removes GPS from every variant by default', async () => {
    const result = await processFixture(fx.phoneJpeg);
    for (const variant of result.variants) {
      const tags = await readTags(variant.key);
      expect(Object.keys(tags).filter((key) => key.startsWith('GPS'))).toEqual([]);
    }
  });

  it('keeps GPS only when the location is explicitly part of the metadata', async () => {
    const inspected = await inspectImage({ buffer: fx.phoneJpeg, filename: 'IMG_1234.jpg' });
    const result = await processFixture(fx.phoneJpeg, {
      metadata: { ...inspected.suggestion.metadata, location: inspected.file.metadata.location },
    });
    const largest = result.variants.at(-1);
    const tags = await getExiftool().read(publicFile(largest?.key ?? ''));
    expect(tags.GPSLatitude).toBeCloseTo(25.6866, 3);
    expect(tags.GPSLongitude).toBeCloseTo(-100.3161, 3);
  });

  it('embeds full metadata in large variants and compact metadata in small ones', async () => {
    const result = await processFixture(fx.phoneJpeg);
    for (const variant of result.variants) {
      const tags = await readTags(variant.key);
      expect(tags['XMP-dc:Creator']).toBe(siteConfig.imageDefaults.creator);
      expect(tags['XMP-dc:Rights']).toBe('© 2026 Aldo. All rights reserved.');
      expect(tags['IFD0:Copyright']).toBe('© 2026 Aldo. All rights reserved.');
      expect(tags['ExifIFD:ColorSpace']).toBe('sRGB');
      if (profileForWidth(variant.w) === 'full') {
        expect(tags['XMP-dc:Title']).toBe('Atardecer en Monterrey');
        expect(tags['XMP-iptcCore:AltTextAccessibility']).toBe('Orange sunset over the hills');
        expect(tags['ExifIFD:DateTimeOriginal']).toBe('2026:03:14 18:22:05');
        expect(tags['IFD0:Model']).toBe('iPhone 15');
      } else {
        expect(tags['XMP-dc:Title']).toBeUndefined();
      }
    }
  });

  it('keeps the metadata overhead small', async () => {
    const opened = sharp(fx.phoneJpeg).rotate();
    const result = await processFixture(fx.phoneJpeg, { watermark: false });
    for (const variant of result.variants) {
      const bare = await renderVariant(opened, variant.w, {
        watermark: null,
        media: siteConfig.media,
      });
      const overhead = variant.bytes - bare.body.byteLength;
      const budget = profileForWidth(variant.w) === 'full' ? 2500 : 1500;
      expect(overhead, `${variant.w}px overhead`).toBeLessThan(budget);
    }
  });

  it('draws a visible watermark in the configured corner only', async () => {
    const solid = await solidJpeg(1200, 800);
    const [marked, clean] = await Promise.all([
      processFixture(solid, { watermark: true, seoName: 'solid-marked' }),
      processFixture(solid, { watermark: false, seoName: 'solid-clean' }),
    ]);
    const pixels = async (key: string, region: Region) =>
      (await sharp(publicFile(key)).extract(region).raw().toBuffer()).values();
    const meanDiff = async (region: Region) => {
      const a = [...(await pixels(marked.variants.at(-1)?.key ?? '', region))];
      const b = [...(await pixels(clean.variants.at(-1)?.key ?? '', region))];
      return a.reduce((sum, value, i) => sum + Math.abs(value - (b[i] ?? 0)), 0) / a.length;
    };
    // siteConfig places the watermark bottom-right.
    expect(await meanDiff({ left: 900, top: 720, width: 300, height: 80 })).toBeGreaterThan(5);
    expect(await meanDiff({ left: 0, top: 0, width: 300, height: 80 })).toBeLessThan(1);
  });

  it('preserves transparency', async () => {
    const result = await processFixture(fx.alphaPng, { seoName: 'alpha', watermark: false });
    const meta = await sharp(publicFile(result.variants[0]?.key ?? '')).metadata();
    expect(meta.hasAlpha).toBe(true);
  });

  it('renders every configured width for a large panorama', async () => {
    const result = await processFixture(fx.panorama, { seoName: 'panorama' });
    expect(result.variants.map((v) => v.w)).toEqual([400, 800, 1200, 1600, 2000]);
    expect(result.variants.at(-1)?.h).toBe(333);
  });

  it('produces a single variant for an image smaller than every width', async () => {
    const result = await processFixture(fx.tinyPng, { seoName: 'tiny' });
    expect(result.variants.map((v) => [v.w, v.h])).toEqual([[300, 200]]);
  });

  it('rejects an invalid SEO name before touching storage', async () => {
    await expect(processFixture(fx.tinyPng, { seoName: 'Not Valid' })).rejects.toThrow(
      /Invalid SEO name/,
    );
  });

  it('removes everything it uploaded when a later step fails', async () => {
    const deleted: { public: string[]; original: string[] } = { public: [], original: [] };
    let uploads = 0;
    const failing: MediaStorage = {
      ...storage,
      putPublic: async (key, body, type) => {
        uploads += 1;
        if (uploads === 3) throw new Error('network down');
        await storage.putPublic(key, body, type);
      },
      deletePublic: async (keys) => {
        deleted.public.push(...keys);
        await storage.deletePublic(keys);
      },
      deleteOriginal: async (key) => {
        deleted.original.push(key);
        await storage.deleteOriginal(key);
      },
    };
    await expect(
      processImage(
        { buffer: fx.panorama, filename: 'p.jpg' },
        { id: crypto.randomUUID(), seoName: 'rollback', metadata: {}, watermark: false },
        failing,
      ),
    ).rejects.toThrow('network down');
    expect(deleted.public).toHaveLength(2);
    expect(deleted.original).toHaveLength(1);
  });
});

describe('reprocessImage', () => {
  it('re-renders from the stored original with new keys and without re-uploading it', async () => {
    const first = await processFixture(fx.phoneJpeg, { watermark: true });
    let originalUploads = 0;
    const counting: MediaStorage = {
      ...storage,
      putOriginal: async (...args) => {
        originalUploads += 1;
        await storage.putOriginal(...args);
      },
    };
    const second = await reprocessImage(
      { originalKey: first.original.key, originalFilename: 'IMG_1234.jpg' },
      {
        id: 'unused',
        seoName: 'atardecer-en-monterrey',
        metadata: {},
        watermark: false,
        year: 2026,
      },
      counting,
    );
    expect(originalUploads).toBe(0);
    expect(second.original.key).toBe(first.original.key);
    const firstKeys = new Set(first.variants.map((v) => v.key));
    expect(second.variants.every((v) => !firstKeys.has(v.key))).toBe(true);
  });
});

describe('HEIC (iPhone)', () => {
  it('decodes HEIC via the WebAssembly fallback when a sample exists', async (ctx) => {
    if (!fx.heic) {
      ctx.skip('No sample at packages/media/test/assets/sample.heic');
      return;
    }
    const inspected = await inspectImage({ buffer: fx.heic, filename: 'IMG_0001.HEIC' });
    expect(inspected.mime).toBe('image/heic');
    // The sample is stored landscape with a 90° HEIF rotation: it must come out portrait.
    expect(inspected.height).toBeGreaterThan(inspected.width);
    const result = await processFixture(fx.heic, { seoName: 'heic-sample' });
    const largest = result.variants.at(-1);
    expect(largest?.w).toBe(2000);
    expect(largest?.h).toBeGreaterThan(largest?.w ?? 0);
  });
});

describe('cli', () => {
  it('processes a file into the output folder', async () => {
    const input = join(fx.dir, 'cli-input.jpg');
    await writeFile(input, fx.phoneJpeg);
    const out = join(fx.dir, 'cli-out');
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      writes.push(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      expect(await runCli(['process', input, '--out', out, '--seo-name', 'from-cli'])).toBe(0);
    } finally {
      process.stdout.write = original;
    }
    const summary = JSON.parse(writes.join('')) as {
      gpsInFile: boolean;
      gpsInOutput: boolean;
      variants: { file: string }[];
    };
    expect(summary.gpsInFile).toBe(true);
    expect(summary.gpsInOutput).toBe(false);
    expect(summary.variants).toHaveLength(4);
    await expect(readFile(summary.variants[0]?.file ?? '')).resolves.toBeInstanceOf(Buffer);
  });
});
