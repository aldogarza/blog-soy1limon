// @ts-check
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { siteConfig } from '@soy1limon/core/site-config';
import { themes } from '@soy1limon/themes';
import { defineConfig } from 'astro/config';

// Variables already set (CI, tests) win over the .env file.
if (existsSync('.env')) process.loadEnvFile('.env');
const contentSource = process.env.CONTENT_SOURCE || 'fixtures';

/** Sample images exist for offline builds only; never ship them with real content. */
function dropFixtureMedia() {
  return /** @type {import('astro').AstroIntegration} */ ({
    name: 'drop-fixture-media',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        if (contentSource === 'fixtures') return;
        await rm(fileURLToPath(new URL('fixtures-media', dir)), { recursive: true, force: true });
      },
    },
  });
}

export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },
  // THEME=<name> previews another theme without editing site-config.ts.
  integrations: [
    themes({ target: 'site', configured: siteConfig.theme, override: process.env.THEME }),
    dropFixtureMedia(),
  ],
  devToolbar: { enabled: false },
});
