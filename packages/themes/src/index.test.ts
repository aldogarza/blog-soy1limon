import { existsSync, readFileSync } from 'node:fs';
import { siteConfig } from '@soy1limon/core';
import { describe, expect, it } from 'vitest';
import { resolveTheme, THEME_NAMES, themes, themeStylesheet } from './index.ts';

describe('themes', () => {
  it('the configured theme exists', () => {
    expect(() => resolveTheme(siteConfig.theme)).not.toThrow();
  });

  it('an override wins, and an unknown name lists the available themes', () => {
    expect(resolveTheme('plain', 'istyle')).toBe('istyle');
    expect(resolveTheme('plain', '  ')).toBe('plain');
    expect(() => resolveTheme('plain', 'neon')).toThrow(/Available themes: plain, istyle/);
  });

  it.each(THEME_NAMES)('"%s" styles both apps on top of the shared foundation', (theme) => {
    for (const target of ['site', 'admin'] as const) {
      const path = themeStylesheet(theme, target);
      expect(existsSync(path), path).toBe(true);
      // The foundation declares the layer order and the accessibility guarantees.
      expect(readFileSync(path, 'utf8')).toContain(`@import '../foundation/${target}.css'`);
    }
  });

  it('the integration injects the stylesheet into every page', () => {
    const injected: string[] = [];
    const integration = themes({ target: 'site', configured: 'plain' });
    const setup = integration.hooks['astro:config:setup'] as unknown as (options: {
      injectScript: (stage: string, content: string) => void;
      logger: { info: (message: string) => void };
    }) => void;
    setup({
      injectScript: (stage, content) => injected.push(`${stage}: ${content}`),
      logger: { info: () => undefined },
    });
    expect(injected).toEqual([
      `page-ssr: import ${JSON.stringify(themeStylesheet('plain', 'site'))};`,
    ]);
  });
});
