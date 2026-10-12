import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createLocalFsStorage } from './local-fs.ts';
import { createR2Storage, type S3Like } from './r2.ts';
import { assertSafeKey, PUBLIC_CACHE_CONTROL } from './types.ts';

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))));

describe('assertSafeKey', () => {
  it.each(['../etc/passwd', '/abs/path', 'images//x.webp', 'images/../../x', 'img/a b.webp', ''])(
    'rejects %j',
    (key) => {
      expect(() => assertSafeKey(key)).toThrow(/Unsafe storage key/);
    },
  );

  it('accepts generated keys', () => {
    expect(() => assertSafeKey('images/2026/sunset-abcd1234-800.webp')).not.toThrow();
    expect(() =>
      assertSafeKey('originals/0f1e2d3c-aaaa-bbbb-cccc-000000000000.heic'),
    ).not.toThrow();
  });
});

describe('local-fs storage', () => {
  it('round-trips originals, keeps public and private apart, and deletes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'soy1limon-storage-'));
    dirs.push(root);
    const storage = createLocalFsStorage({ root, publicBaseUrl: 'http://127.0.0.1:4322/files/' });

    await storage.putOriginal('originals/a.jpg', Buffer.from('original'), 'image/jpeg');
    await storage.putPublic('images/2026/a-1-400.webp', Buffer.from('variant'), 'image/webp');

    expect((await storage.getOriginal('originals/a.jpg')).toString()).toBe('original');
    expect(storage.publicUrl('images/2026/a-1-400.webp')).toBe(
      'http://127.0.0.1:4322/files/images/2026/a-1-400.webp',
    );
    await expect(storage.getOriginal('images/2026/a-1-400.webp')).rejects.toThrow();

    await storage.deletePublic(['images/2026/a-1-400.webp']);
    await storage.deleteOriginal('originals/a.jpg');
    await expect(storage.getOriginal('originals/a.jpg')).rejects.toThrow();
  });
});

describe('r2 storage', () => {
  function fakeClient() {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    const client: S3Like = {
      send: ((command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: command.constructor.name, input: command.input });
        return Promise.resolve({});
      }) as unknown as S3Like['send'],
    };
    return { client, sent };
  }

  const options = {
    accountId: 'acc',
    accessKeyId: 'id',
    secretAccessKey: 'secret',
    mediaBucket: 'media',
    originalsBucket: 'originals',
    publicBaseUrl: 'https://img.example.com',
  };

  it('uploads variants to the public bucket with immutable caching', async () => {
    const { client, sent } = fakeClient();
    await createR2Storage(options, client).putPublic(
      'images/2026/a-1-400.webp',
      Buffer.from('x'),
      'image/webp',
    );
    expect(sent[0]).toMatchObject({
      name: 'PutObjectCommand',
      input: { Bucket: 'media', ContentType: 'image/webp', CacheControl: PUBLIC_CACHE_CONTROL },
    });
  });

  it('uploads originals to the private bucket without public caching', async () => {
    const { client, sent } = fakeClient();
    await createR2Storage(options, client).putOriginal(
      'originals/a.jpg',
      Buffer.from('x'),
      'image/jpeg',
    );
    expect(sent[0]?.input).toMatchObject({ Bucket: 'originals' });
    expect(sent[0]?.input.CacheControl).toBeUndefined();
  });

  it('deletes public keys in batches of 1000', async () => {
    const { client, sent } = fakeClient();
    const keys = Array.from({ length: 1001 }, (_, i) => `images/2026/k-${i}-400.webp`);
    await createR2Storage(options, client).deletePublic(keys);
    expect(sent.map((call) => call.name)).toEqual(['DeleteObjectsCommand', 'DeleteObjectsCommand']);
  });

  it('builds public URLs on the custom domain', () => {
    expect(
      createR2Storage(options, fakeClient().client).publicUrl('images/2026/a-1-400.webp'),
    ).toBe('https://img.example.com/images/2026/a-1-400.webp');
  });
});
