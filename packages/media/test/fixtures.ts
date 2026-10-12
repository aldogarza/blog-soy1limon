import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExifTool } from 'exiftool-vendored';
import sharp from 'sharp';

// Test images are generated, not committed: no binary blobs or personal photos in the public repo.

function gradientSvg(width: number, height: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs><linearGradient id="g"><stop offset="0" stop-color="#ff7a00"/><stop offset="1" stop-color="#2a3d8f"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${width * 0.25}" cy="${height * 0.3}" r="${Math.min(width, height) * 0.18}" fill="#ffd400"/>
</svg>`);
}

/** A solid image makes watermark detection unambiguous. */
export async function solidJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#2a3d8f' } })
    .jpeg()
    .toBuffer();
}

export interface Fixtures {
  dir: string;
  /** 2400x1600 stored landscape with EXIF orientation 6 (displays as 1600x2400), GPS, title, camera. */
  phoneJpeg: Buffer;
  /** 500x300 PNG with a transparent half. */
  alphaPng: Buffer;
  /** 6000x1000 panorama. */
  panorama: Buffer;
  /** 300x200: smaller than every configured width. */
  tinyPng: Buffer;
  /** Plain text pretending to be a JPEG. */
  textAsJpeg: Buffer;
  /** Real iPhone HEIC, only if someone placed one at test/assets/sample.heic (see docs/media-pipeline.md). */
  heic: Buffer | null;
  cleanup(): Promise<void>;
}

export async function createFixtures(): Promise<Fixtures> {
  const dir = await mkdtemp(join(tmpdir(), 'soy1limon-media-test-'));

  const phonePath = join(dir, 'IMG_1234.jpg');
  await sharp(gradientSvg(2400, 1600))
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 })
    .toFile(phonePath);
  // A dedicated instance: the code under test owns (and closes) its own exiftool process.
  const exiftool = new ExifTool();
  await exiftool.write(
    phonePath,
    {
      'XMP-dc:Title': 'Atardecer en Monterrey',
      // Monterrey, Mexico: western hemisphere, so the longitude must come back negative.
      GPSLatitude: 25.6866,
      GPSLongitude: -100.3161,
      Make: 'Apple',
      Model: 'iPhone 15',
      FNumber: 1.6,
      ISO: 50,
      ExposureTime: '1/120',
      DateTimeOriginal: '2026:03:14 18:22:05',
      OffsetTimeOriginal: '-06:00',
    } as Parameters<ExifTool['write']>[1],
    { writeArgs: ['-overwrite_original'] },
  );
  await exiftool.end();

  // Left half opaque green, right half fully transparent.
  const alphaPng = await sharp({
    create: { width: 500, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 250,
            height: 300,
            channels: 4,
            background: { r: 0, g: 128, b: 0, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

  const heicPath = fileURLToPath(new URL('./assets/sample.heic', import.meta.url));

  return {
    dir,
    phoneJpeg: await readFile(phonePath),
    alphaPng,
    panorama: await sharp(gradientSvg(6000, 1000)).jpeg().toBuffer(),
    tinyPng: await sharp(gradientSvg(300, 200)).png().toBuffer(),
    textAsJpeg: Buffer.from('this is not an image, just text named photo.jpg'),
    heic: existsSync(heicPath) ? await readFile(heicPath) : null,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
