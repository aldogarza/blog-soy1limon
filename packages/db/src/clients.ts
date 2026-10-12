import { isPrivilegedSupabaseKey } from '@soy1limon/core/env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';

export type DbClient = SupabaseClient<Database>;

// Server-side usage only: no browser session, no token refresh timers keeping Node alive.
const serverAuthOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

/**
 * Read-only client for the public build. Row Level Security limits it to published content,
 * so it refuses privileged keys that would silently bypass those rules.
 */
export function createPublicClient(config: { url: string; publishableKey: string }): DbClient {
  if (isPrivilegedSupabaseKey(config.publishableKey)) {
    throw new Error(
      'createPublicClient() received a secret/service_role key; use the publishable key.',
    );
  }
  return createClient<Database>(config.url, config.publishableKey, { auth: serverAuthOptions });
}
