import type { AdminEnv } from '@soy1limon/core/env';
import { createLocalFsStorage } from './local-fs.ts';
import { createR2Storage } from './r2.ts';
import type { MediaStorage } from './types.ts';

export { createLocalFsStorage } from './local-fs.ts';
export { createR2Storage, type R2Options, type S3Like } from './r2.ts';
export { assertSafeKey, type MediaStorage, PUBLIC_CACHE_CONTROL } from './types.ts';

/** Picks the storage driver from the validated admin environment. */
export function createStorage(env: AdminEnv, localRoot: string): MediaStorage {
  if (env.STORAGE_DRIVER === 'local-fs') {
    return createLocalFsStorage({ root: localRoot, publicBaseUrl: env.MEDIA_BASE_URL });
  }
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_MEDIA_BUCKET,
    R2_ORIGINALS_BUCKET,
  } = env;
  // adminEnvSchema already requires these for r2; the check narrows the types.
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_MEDIA_BUCKET ||
    !R2_ORIGINALS_BUCKET
  ) {
    throw new Error('Missing R2 configuration for STORAGE_DRIVER=r2');
  }
  return createR2Storage({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    mediaBucket: R2_MEDIA_BUCKET,
    originalsBucket: R2_ORIGINALS_BUCKET,
    publicBaseUrl: env.MEDIA_BASE_URL,
  });
}
