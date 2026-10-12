import type { DbClient } from '@soy1limon/db';
import { createAdminClient } from '@soy1limon/db/admin';
import { createStorage, type MediaStorage } from '@soy1limon/media';
import { adminEnv, localMediaRoot } from './env.ts';

let db: DbClient | undefined;
let storage: MediaStorage | undefined;

export function getDb(): DbClient {
  const env = adminEnv();
  db ??= createAdminClient({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY });
  return db;
}

export function getStorage(): MediaStorage {
  storage ??= createStorage(adminEnv(), localMediaRoot());
  return storage;
}
