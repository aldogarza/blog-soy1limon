import { defineMiddleware } from 'astro:middleware';
import { isLoopbackAddress, isLoopbackHost } from './lib/server/host.ts';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export const onRequest = defineMiddleware(async (context, next) => {
  // The admin holds the privileged database key: refuse anything that is not a local request.
  if (!isLoopbackHost(context.request.headers.get('host'))) {
    return new Response('Forbidden: the admin only answers on localhost.', { status: 403 });
  }
  let address: string | undefined;
  try {
    address = context.clientAddress;
  } catch {
    // Not available for prerendered routes; the admin has none, so this stays undefined only in tests.
  }
  if (address && !isLoopbackAddress(address)) {
    return new Response('Forbidden: remote clients are not allowed.', { status: 403 });
  }

  const response = await next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    try {
      response.headers.set(name, value);
    } catch {
      // Some responses (e.g. proxied static files) have immutable headers.
    }
  }
  return response;
});
