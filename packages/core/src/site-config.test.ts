import { describe, expect, it } from 'vitest';
import { siteConfig, siteConfigSchema } from './site-config.ts';

describe('siteConfig', () => {
  it('is valid against its schema', () => {
    expect(() => siteConfigSchema.parse(siteConfig)).not.toThrow();
  });

  it('includes the default locale in the locale list', () => {
    expect(siteConfig.locales).toContain(siteConfig.defaultLocale);
  });

  it('rejects widths that are not strictly ascending', () => {
    const invalid = { ...siteConfig, media: { ...siteConfig.media, widths: [800, 400] } };
    expect(siteConfigSchema.safeParse(invalid).success).toBe(false);
  });
});
