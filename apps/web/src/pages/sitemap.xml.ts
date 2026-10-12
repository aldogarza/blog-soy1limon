import type { APIRoute } from 'astro';
import { siteContent } from '../lib/content.ts';
import { mediaBaseUrl } from '../lib/env.ts';
import { renderSitemap, sitemapEntries } from '../lib/sitemap.ts';

export const GET: APIRoute = async ({ site }) => {
  const origin = site ?? new URL('http://localhost');
  const xml = renderSitemap(sitemapEntries(await siteContent(), mediaBaseUrl(), origin), origin);
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
