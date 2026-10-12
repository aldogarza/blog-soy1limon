import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAdminClient } from '../src/admin/client.ts';
import { createPublicClient, type DbClient } from '../src/clients.ts';

export interface LocalStack {
  url: string;
  publishableKey: string;
  secretKey: string;
}

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function parseEnvOutput(output: string): Record<string, string> {
  const entries = output
    .split('\n')
    .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
    .filter((match) => match !== null)
    .map((match) => [match[1] ?? '', match[2] ?? ''] as const);
  return Object.fromEntries(entries);
}

let cached: LocalStack | undefined;

/**
 * Reads URL and keys from `supabase status`. Integration tests must never touch the real project,
 * so anything other than a loopback URL aborts the run.
 */
export function localStack(): LocalStack {
  if (cached) return cached;
  let output: string;
  try {
    output = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error('The local Supabase stack is not running. Start it with `pnpm db:start`.');
  }
  const env = parseEnvOutput(output);
  const url = env.API_URL;
  const publishableKey = env.PUBLISHABLE_KEY;
  const secretKey = env.SECRET_KEY;
  if (!url || !publishableKey || !secretKey) {
    throw new Error('`supabase status` did not report API_URL, PUBLISHABLE_KEY and SECRET_KEY.');
  }
  const { hostname } = new URL(url);
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(
      `Refusing to run integration tests against ${url}; only the local stack is allowed.`,
    );
  }
  cached = { url, publishableKey, secretKey };
  return cached;
}

export function adminDb(): DbClient {
  const stack = localStack();
  return createAdminClient({ url: stack.url, secretKey: stack.secretKey });
}

export function anonDb(): DbClient {
  const stack = localStack();
  return createPublicClient({ url: stack.url, publishableKey: stack.publishableKey });
}

/** Unique, valid slug per test run so tests never collide with seed data or each other. */
export function uniqueSlug(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
