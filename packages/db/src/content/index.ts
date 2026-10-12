import type { WebEnv } from '@soy1limon/core/env';
import { createPublicClient } from '../clients.ts';
import { loadFixtureContent } from './fixtures-source.ts';
import type { PublishedContent } from './schemas.ts';
import { fetchPublishedContent } from './supabase-source.ts';

export * from './schemas.ts';
export { fetchPublishedContent, PUBLIC_IMAGE_COLUMNS } from './supabase-source.ts';
export { loadFixtureContent } from './fixtures-source.ts';

/** Single entry point for the public build: same shape whether data comes from Supabase or fixtures. */
export async function loadPublishedContent(env: WebEnv): Promise<PublishedContent> {
  if (env.CONTENT_SOURCE === 'fixtures') return loadFixtureContent();

  // webEnvSchema guarantees both values when CONTENT_SOURCE=supabase; re-check to narrow the types.
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required when CONTENT_SOURCE=supabase',
    );
  }
  const db = createPublicClient({
    url: env.SUPABASE_URL,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
  });
  return fetchPublishedContent(db);
}
