/** Where processed variants (public) and untouched originals (private) are stored. */
export interface MediaStorage {
  putPublic(key: string, body: Uint8Array, contentType: string): Promise<void>;
  putOriginal(key: string, body: Uint8Array, contentType: string): Promise<void>;
  getOriginal(key: string): Promise<Buffer>;
  deletePublic(keys: readonly string[]): Promise<void>;
  deleteOriginal(key: string): Promise<void>;
  publicUrl(key: string): string;
}

// Content-addressed keys never change content, so browsers and Cloudflare may cache them forever.
export const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]*$/i;

/** Rejects keys that could escape the storage root (`..`, absolute paths, odd characters). */
export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.split('/').some((part) => part === '..' || part === '')) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
}
