import { isPrivilegedSupabaseKey } from '@soy1limon/core/env';
import { createClient } from '@supabase/supabase-js';
import type { DbClient } from '../clients.ts';
import type { Database } from '../database.types.ts';

function isLoopbackUrl(url: string): boolean {
  const { hostname } = new URL(url);
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

/**
 * Privileged client for the local admin. It bypasses Row Level Security, so in CI it is only
 * allowed against the throwaway local Supabase stack, never against the real project.
 */
export function createAdminClient(
  config: { url: string; secretKey: string },
  environment: Record<string, string | undefined> = process.env,
): DbClient {
  if (environment.CI === 'true' && !isLoopbackUrl(config.url)) {
    throw new Error(
      'createAdminClient() refuses to use a privileged key against a remote project in CI.',
    );
  }
  if (!isPrivilegedSupabaseKey(config.secretKey)) {
    throw new Error(
      'createAdminClient() needs the secret key (sb_secret_…), not the publishable key.',
    );
  }
  return createClient<Database>(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
