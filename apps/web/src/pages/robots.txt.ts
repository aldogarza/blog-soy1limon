import type { APIRoute } from 'astro';
import { webEnv } from '../lib/env.ts';

// Only the production deploy may be crawled; any other build tells crawlers to stay out.
export const GET: APIRoute = ({ site }) => {
  const production = webEnv().DEPLOY_ENV === 'production';
  const sitemap = new URL('/sitemap.xml', site ?? 'http://localhost').href;
  const body = [
    `User-agent: *`,
    production ? 'Allow: /' : 'Disallow: /',
    '',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
