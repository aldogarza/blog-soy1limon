import { z } from 'zod';

export class EnvError extends Error {
  override name = 'EnvError';
}

type EnvSource = Record<string, string | undefined>;

/**
 * Validates environment variables and fails fast with a readable list of problems.
 * Empty strings are treated as missing so a blank line in .env does not pass validation.
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: EnvSource,
  context: string,
): z.output<S> {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new EnvError(
      `Invalid environment for ${context}:\n${lines.join('\n')}\nCompare your .env with the matching .env.example file.`,
    );
  }
  return result.data;
}

/** Detects Supabase keys that bypass Row Level Security (new `sb_secret_` keys or legacy service_role JWTs). */
export function isPrivilegedSupabaseKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return (
      typeof claims === 'object' &&
      claims !== null &&
      'role' in claims &&
      claims.role === 'service_role'
    );
  } catch {
    return false;
  }
}

const required = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .trim()
    .min(1, { error: `${name} is required` });

const httpUrl = (name: string) =>
  z.url({ protocol: /^https?$/, error: `${name} must be an http(s) URL` });

export const STORAGE_DRIVERS = ['r2', 'local-fs'] as const;
export const CONTENT_SOURCES = ['supabase', 'fixtures'] as const;

const R2_KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_MEDIA_BUCKET',
  'R2_ORIGINALS_BUCKET',
] as const;

/** Environment of the local-only admin app (apps/admin/.env). Holds the only privileged credentials. */
export const adminEnvSchema = z
  .object({
    SUPABASE_URL: httpUrl('SUPABASE_URL'),
    SUPABASE_SECRET_KEY: required('SUPABASE_SECRET_KEY').refine(isPrivilegedSupabaseKey, {
      error:
        'SUPABASE_SECRET_KEY must be the secret key (sb_secret_…) or the legacy service_role key; the admin needs it to manage drafts',
    }),
    STORAGE_DRIVER: z.enum(STORAGE_DRIVERS).default('local-fs'),
    MEDIA_BASE_URL: httpUrl('MEDIA_BASE_URL'),
    /** Folder for local-fs storage and upload staging; defaults to `.media-local` at the repo root. */
    LOCAL_MEDIA_ROOT: z.string().optional(),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_MEDIA_BUCKET: z.string().optional(),
    R2_ORIGINALS_BUCKET: z.string().optional(),
    GITHUB_REPO: z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/, { error: 'GITHUB_REPO must look like "owner/repo"' })
      .optional(),
    GITHUB_TOKEN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 'r2') {
      for (const key of R2_KEYS) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=r2`,
          });
        }
      }
    }
    if (Boolean(env.GITHUB_REPO) !== Boolean(env.GITHUB_TOKEN)) {
      ctx.addIssue({
        code: 'custom',
        path: [env.GITHUB_REPO ? 'GITHUB_TOKEN' : 'GITHUB_REPO'],
        message: 'GITHUB_REPO and GITHUB_TOKEN must be set together (needed to trigger deploys)',
      });
    }
  });

export type AdminEnv = z.output<typeof adminEnvSchema>;

/** Environment of the public site build (apps/web/.env locally, repository secrets in CI). */
export const webEnvSchema = z
  .object({
    CONTENT_SOURCE: z.enum(CONTENT_SOURCES).default('fixtures'),
    SITE_URL: httpUrl('SITE_URL'),
    /**
     * Where public image variants live (the R2 custom domain in production). Fixture builds default
     * to the sample images shipped in apps/web/public/fixtures-media.
     */
    MEDIA_BASE_URL: z
      .string()
      .refine((value) => value.startsWith('/') || /^https?:\/\//.test(value), {
        error: 'MEDIA_BASE_URL must be an http(s) URL or a site-relative path',
      })
      .optional(),
    SUPABASE_URL: httpUrl('SUPABASE_URL').optional(),
    SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.CONTENT_SOURCE !== 'supabase') return;
    if (!env.MEDIA_BASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['MEDIA_BASE_URL'],
        message: 'MEDIA_BASE_URL is required when CONTENT_SOURCE=supabase',
      });
    }
    if (!env.SUPABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_URL'],
        message: 'SUPABASE_URL is required when CONTENT_SOURCE=supabase',
      });
    }
    if (!env.SUPABASE_PUBLISHABLE_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_PUBLISHABLE_KEY'],
        message: 'SUPABASE_PUBLISHABLE_KEY is required when CONTENT_SOURCE=supabase',
      });
    } else if (isPrivilegedSupabaseKey(env.SUPABASE_PUBLISHABLE_KEY)) {
      // The build only needs published rows; a privileged key here would expose drafts and bypass RLS.
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_PUBLISHABLE_KEY'],
        message:
          'SUPABASE_PUBLISHABLE_KEY is a secret/service_role key; use the publishable (anon) key instead',
      });
    }
  });

export type WebEnv = z.output<typeof webEnvSchema>;
