import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type AdminEnv, adminEnvSchema, parseEnv } from '@soy1limon/core/env';

let cached: AdminEnv | undefined;

/** Validated admin environment from apps/admin/.env. Variables already set in the process win. */
export function adminEnv(): AdminEnv {
  if (cached) return cached;
  const file = join(process.cwd(), '.env');
  // loadEnvFile never overrides existing variables, so tests can point the admin at the local stack.
  if (existsSync(file)) process.loadEnvFile(file);
  cached = parseEnv(adminEnvSchema, process.env, 'the admin (apps/admin/.env)');
  return cached;
}

/** Root for local-fs storage and upload staging; `.media-local/` at the repo root by default. */
export function localMediaRoot(env: AdminEnv = adminEnv()): string {
  return resolve(env.LOCAL_MEDIA_ROOT ?? join(process.cwd(), '..', '..', '.media-local'));
}
