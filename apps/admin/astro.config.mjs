// @ts-check
import node from '@astrojs/node';
import vue from '@astrojs/vue';
import { existsSync } from 'node:fs';
import { siteConfig } from '@soy1limon/core/site-config';
import { themes } from '@soy1limon/themes';
import { defineConfig } from 'astro/config';

// The admin is a local tool: it binds to loopback only and is never deployed.
const HOST = '127.0.0.1';
const PORT = 4322;

// Variables already set (e.g. by tests) win over the .env file.
if (existsSync('.env')) process.loadEnvFile('.env');
const mediaOrigin = process.env.MEDIA_BASE_URL ? new URL(process.env.MEDIA_BASE_URL).origin : '';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // THEME=<name> previews another theme without editing site-config.ts.
  integrations: [
    vue(),
    themes({ target: 'admin', configured: siteConfig.theme, override: process.env.THEME }),
  ],
  server: { host: HOST, port: PORT },
  devToolbar: { enabled: false },
  vite: {
    ssr: {
      // Native or process-spawning modules must load from node_modules at runtime, not be bundled.
      // They are direct dependencies of this app so Node can resolve them (pnpm is strict).
      external: ['sharp', 'exiftool-vendored', 'heic-decode'],
    },
  },
  security: {
    // CSRF protection: rejects cross-site form posts (another tab cannot drive the admin).
    checkOrigin: true,
    // Photos straight from a phone or camera easily exceed the 1 MB default.
    // Slightly above siteConfig.media.maxUploadBytes (200 MB) to leave room for the multipart envelope.
    actionBodySizeLimit: 210 * 1024 * 1024,
    // Hash-based Content Security Policy for scripts and styles, plus these directives.
    csp: {
      directives: [
        "default-src 'self'",
        /** @type {const} */ (`img-src 'self' blob: data:${mediaOrigin ? ` ${mediaOrigin}` : ''}`),
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      // Syntax-highlighted code (Shiki) colours tokens with inline style attributes. Allowing only
      // style *attributes* keeps <style> elements and all scripts under the hash-based policy.
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
    },
  },
});
