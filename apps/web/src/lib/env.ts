import { parseEnv, type WebEnv, webEnvSchema } from '@soy1limon/core/env';

/** Sample images shipped in public/ for offline fixture builds. */
export const FIXTURE_MEDIA_BASE = '/fixtures-media';

let cached: WebEnv | undefined;

export function webEnv(): WebEnv {
  cached ??= parseEnv(webEnvSchema, process.env, 'the public site build (apps/web/.env)');
  return cached;
}

export function mediaBaseUrl(env: WebEnv = webEnv()): string {
  return env.MEDIA_BASE_URL ?? FIXTURE_MEDIA_BASE;
}
