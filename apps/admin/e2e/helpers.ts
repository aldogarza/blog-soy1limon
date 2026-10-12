import AxeBuilder from '@axe-core/playwright';
import type { LocalizedText } from '@soy1limon/core';
import { createAdminClient, createImage, updateImage } from '@soy1limon/db/admin';
import { createLocalFsStorage, processImage } from '@soy1limon/media';
import { expect, type Page } from '@playwright/test';
import { ExifTool } from 'exiftool-vendored';
import sharp from 'sharp';

export const exiftool = new ExifTool();

export function adminDb() {
  return createAdminClient({
    url: process.env.E2E_SUPABASE_URL ?? '',
    secretKey: process.env.E2E_SUPABASE_SECRET_KEY ?? '',
  });
}

/** Fails the test on any WCAG 2.2 A/AA violation, listing what and where. */
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
  expect(summary, `axe violations on ${page.url()}`).toEqual([]);
}

/** A JPEG with a title, camera info and GPS, like a phone photo. */
export async function phonePhoto(title: string, dir: string): Promise<Buffer> {
  const path = `${dir}/phone-${crypto.randomUUID()}.jpg`;
  await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#d2691e' } })
    .jpeg()
    .toFile(path);
  await exiftool.write(
    path,
    {
      'XMP-dc:Title': title,
      Make: 'Apple',
      Model: 'iPhone 18 Pro',
      GPSLatitude: 25.6706,
      GPSLongitude: -100.3773,
      DateTimeOriginal: '2026:10:07 07:59:40',
    } as Parameters<ExifTool['write']>[1],
    { writeArgs: ['-overwrite_original'] },
  );
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}

export async function plainPng(): Promise<Buffer> {
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#2e8b57' } })
    .png()
    .toBuffer();
}

/** Processes a solid-colour image straight through the pipeline (faster than the upload UI). */
export async function seedImage(
  created: string[],
  seoName: string,
  colour: string,
  alt: LocalizedText,
): Promise<string> {
  const id = crypto.randomUUID();
  const buffer = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: colour },
  })
    .jpeg()
    .toBuffer();
  const storage = createLocalFsStorage({
    root: process.env.E2E_MEDIA_ROOT ?? '',
    publicBaseUrl: 'http://127.0.0.1:4323/files',
  });
  const db = adminDb();
  await createImage(db, {
    id,
    seoName,
    originalKey: `originals/${id}.jpg`,
    originalFilename: `${seoName}.jpg`,
    originalMime: 'image/jpeg',
    originalBytes: buffer.byteLength,
    alt,
  });
  const result = await processImage(
    { buffer, filename: `${seoName}.jpg` },
    { id, seoName, metadata: {}, watermark: false },
    storage,
  );
  await updateImage(db, id, {
    status: 'ready',
    width: result.width,
    height: result.height,
    dominantColor: result.dominantColor,
    variants: result.variants,
  });
  created.push(id);
  return id;
}
