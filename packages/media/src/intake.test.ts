import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { detectImage, UnsupportedImageError } from './intake.ts';

const MB = 1024 * 1024;

describe('detectImage', () => {
  it('trusts the bytes, not the name: a PNG renamed to .jpg is a PNG', async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    await expect(detectImage(png, MB)).resolves.toMatchObject({ mime: 'image/png', ext: 'png' });
  });

  it('rejects text pretending to be an image', async () => {
    await expect(detectImage(Buffer.from('not an image'), MB)).rejects.toBeInstanceOf(
      UnsupportedImageError,
    );
  });

  it('rejects non-image formats even when they are valid files', async () => {
    const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n');
    await expect(detectImage(pdf, MB)).rejects.toThrow(/Unsupported file type/);
  });

  it('rejects empty and oversized files', async () => {
    await expect(detectImage(Buffer.alloc(0), MB)).rejects.toThrow(/empty/);
    const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#000' } })
      .jpeg()
      .toBuffer();
    await expect(detectImage(jpeg, 10)).rejects.toThrow(/larger than/);
  });
});
