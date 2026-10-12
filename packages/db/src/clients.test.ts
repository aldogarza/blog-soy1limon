import { describe, expect, it } from 'vitest';
import { createAdminClient } from './admin/client.ts';
import { createPublicClient } from './clients.ts';

describe('createPublicClient', () => {
  it('refuses privileged keys', () => {
    expect(() =>
      createPublicClient({ url: 'https://abc.supabase.co', publishableKey: 'sb_secret_abc' }),
    ).toThrow(/publishable key/);
  });

  it('accepts a publishable key', () => {
    expect(() =>
      createPublicClient({ url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_abc' }),
    ).not.toThrow();
  });
});

describe('createAdminClient', () => {
  const remote = { url: 'https://abc.supabase.co', secretKey: 'sb_secret_abc' };
  const local = { url: 'http://127.0.0.1:54321', secretKey: 'sb_secret_abc' };

  it('refuses a remote project in CI', () => {
    expect(() => createAdminClient(remote, { CI: 'true' })).toThrow(/remote project in CI/);
  });

  it('allows the local stack in CI (integration tests)', () => {
    expect(() => createAdminClient(local, { CI: 'true' })).not.toThrow();
  });

  it('allows a remote project outside CI (the local admin)', () => {
    expect(() => createAdminClient(remote, {})).not.toThrow();
  });

  it('refuses the publishable key', () => {
    expect(() => createAdminClient({ ...local, secretKey: 'sb_publishable_abc' }, {})).toThrow(
      /secret key/,
    );
  });
});
