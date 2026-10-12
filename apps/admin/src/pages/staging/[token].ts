import type { APIRoute } from 'astro';
import { localMediaRoot } from '../../lib/server/env.ts';
import { readStagedPreview } from '../../lib/server/staging.ts';

// Preview of an upload that has not been processed yet (always WebP, also for HEIC sources).
export const GET: APIRoute = async ({ params }) => {
  try {
    const body = await readStagedPreview(localMediaRoot(), params.token ?? '');
    return new Response(new Uint8Array(body), {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
};
