import { describe, expect, it } from 'vitest';
import {
  adminEnvSchema,
  EnvError,
  isPrivilegedSupabaseKey,
  parseEnv,
  webEnvSchema,
} from './env.ts';

const fakeJwt = (claims: object) =>
  ['header', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'signature'].join('.');

describe('isPrivilegedSupabaseKey', () => {
  it('detects new secret keys and legacy service_role JWTs', () => {
    expect(isPrivilegedSupabaseKey('sb_secret_abc')).toBe(true);
    expect(isPrivilegedSupabaseKey(fakeJwt({ role: 'service_role' }))).toBe(true);
  });

  it('treats publishable and anon keys as unprivileged', () => {
    expect(isPrivilegedSupabaseKey('sb_publishable_abc')).toBe(false);
    expect(isPrivilegedSupabaseKey(fakeJwt({ role: 'anon' }))).toBe(false);
    expect(isPrivilegedSupabaseKey('not-a-key')).toBe(false);
  });
});

describe('adminEnvSchema', () => {
  const base = {
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SECRET_KEY: 'sb_secret_abc',
    MEDIA_BASE_URL: 'http://127.0.0.1:4322/files',
  };

  it('accepts a minimal local-fs setup and defaults the storage driver', () => {
    const env = parseEnv(adminEnvSchema, base, 'admin');
    expect(env.STORAGE_DRIVER).toBe('local-fs');
  });

  it('requires every R2 variable when STORAGE_DRIVER=r2', () => {
    expect(() => parseEnv(adminEnvSchema, { ...base, STORAGE_DRIVER: 'r2' }, 'admin')).toThrow(
      /R2_ACCOUNT_ID is required when STORAGE_DRIVER=r2/,
    );
  });

  it('rejects a publishable key where the secret key is expected', () => {
    expect(() =>
      parseEnv(adminEnvSchema, { ...base, SUPABASE_SECRET_KEY: 'sb_publishable_abc' }, 'admin'),
    ).toThrow(/SUPABASE_SECRET_KEY must be the secret key/);
  });

  it('requires GITHUB_REPO and GITHUB_TOKEN together', () => {
    expect(() => parseEnv(adminEnvSchema, { ...base, GITHUB_REPO: 'aldo/blog' }, 'admin')).toThrow(
      /GITHUB_TOKEN/,
    );
  });

  it('treats blank values as missing', () => {
    expect(() =>
      parseEnv(adminEnvSchema, { ...base, SUPABASE_SECRET_KEY: '   ' }, 'admin'),
    ).toThrow(/SUPABASE_SECRET_KEY is required/);
  });
});

describe('webEnvSchema', () => {
  it('defaults to fixtures so builds work offline and in pull requests', () => {
    const env = parseEnv(webEnvSchema, { SITE_URL: 'https://example.com' }, 'web');
    expect(env.CONTENT_SOURCE).toBe('fixtures');
  });

  it('requires Supabase credentials when CONTENT_SOURCE=supabase', () => {
    expect(() =>
      parseEnv(
        webEnvSchema,
        { SITE_URL: 'https://example.com', CONTENT_SOURCE: 'supabase' },
        'web',
      ),
    ).toThrow(EnvError);
  });

  it('refuses a privileged key in the public build', () => {
    expect(() =>
      parseEnv(
        webEnvSchema,
        {
          SITE_URL: 'https://example.com',
          CONTENT_SOURCE: 'supabase',
          SUPABASE_URL: 'https://abc.supabase.co',
          SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc',
        },
        'web',
      ),
    ).toThrow(/use the publishable \(anon\) key/);
  });

  it('lists every problem in one readable error', () => {
    try {
      parseEnv(webEnvSchema, { SITE_URL: 'not a url', CONTENT_SOURCE: 'supabase' }, 'web');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const message = (error as Error).message;
      expect(message).toContain('SITE_URL');
      expect(message).toContain('SUPABASE_URL');
      expect(message).toContain('SUPABASE_PUBLISHABLE_KEY');
    }
  });
});

describe('webEnvSchema deploy environment', () => {
  const supabase = {
    SITE_URL: 'https://example.com',
    CONTENT_SOURCE: 'supabase',
    SUPABASE_URL: 'https://abc.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
    MEDIA_BASE_URL: 'https://img.example.com',
  };

  it('defaults to development so local builds never count visits', () => {
    expect(parseEnv(webEnvSchema, { SITE_URL: 'https://example.com' }, 'web').DEPLOY_ENV).toBe(
      'development',
    );
  });

  it('refuses a production build from the sample fixtures', () => {
    expect(() =>
      parseEnv(webEnvSchema, { SITE_URL: 'https://example.com', DEPLOY_ENV: 'production' }, 'web'),
    ).toThrow(/production build must use CONTENT_SOURCE=supabase/);
  });

  it('accepts a production build from Supabase with an analytics token', () => {
    const env = parseEnv(
      webEnvSchema,
      { ...supabase, DEPLOY_ENV: 'production', CLOUDFLARE_WEB_ANALYTICS_TOKEN: 'a'.repeat(32) },
      'web',
    );
    expect(env.DEPLOY_ENV).toBe('production');
  });

  it('rejects a malformed analytics token', () => {
    expect(() =>
      parseEnv(webEnvSchema, { ...supabase, CLOUDFLARE_WEB_ANALYTICS_TOKEN: 'not-a-token' }, 'web'),
    ).toThrow(/32-character hex token/);
  });
});
