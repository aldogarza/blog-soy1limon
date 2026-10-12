import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertSafeKey, type MediaStorage } from './types.ts';

/**
 * Development/test storage on disk: `<root>/public/<key>` mirrors the public bucket and
 * `<root>/private/<key>` the private one. The admin serves `<root>/public` at MEDIA_BASE_URL.
 */
export function createLocalFsStorage(options: {
  root: string;
  publicBaseUrl: string;
}): MediaStorage {
  const publicPath = (key: string) => {
    assertSafeKey(key);
    return join(options.root, 'public', key);
  };
  const originalPath = (key: string) => {
    assertSafeKey(key);
    return join(options.root, 'private', key);
  };
  const write = async (path: string, body: Uint8Array) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  };
  const baseUrl = options.publicBaseUrl.replace(/\/+$/, '');

  return {
    putPublic: (key, body) => write(publicPath(key), body),
    putOriginal: (key, body) => write(originalPath(key), body),
    getOriginal: (key) => readFile(originalPath(key)),
    deletePublic: async (keys) => {
      await Promise.all(keys.map((key) => rm(publicPath(key), { force: true })));
    },
    deleteOriginal: (key) => rm(originalPath(key), { force: true }),
    publicUrl: (key) => {
      assertSafeKey(key);
      return `${baseUrl}/${key}`;
    },
  };
}
