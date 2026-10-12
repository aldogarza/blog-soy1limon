import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertSafeKey } from '@soy1limon/media';
import type { APIRoute } from 'astro';
import { adminEnv, localMediaRoot } from '../../lib/server/env.ts';

// Serves local-fs "public bucket" files during development (MEDIA_BASE_URL=http://127.0.0.1:4322/files).
export const GET: APIRoute = async ({ params }) => {
  if (adminEnv().STORAGE_DRIVER !== 'local-fs') return new Response('Not found', { status: 404 });
  const key = params.key ?? '';
  try {
    assertSafeKey(key);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  try {
    const body = await readFile(join(localMediaRoot(), 'public', key));
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': key.endsWith('.webp') ? 'image/webp' : 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
};
