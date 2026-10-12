const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * DNS-rebinding protection: a malicious site can make `evil.example` resolve to 127.0.0.1, but the
 * browser still sends `Host: evil.example`. Only loopback host names are accepted.
 */
export function isLoopbackHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(`http://${hostHeader}`).hostname);
  } catch {
    return false;
  }
}

/** True for IPv4/IPv6 loopback peers, including IPv4-mapped IPv6 (`::ffff:127.0.0.1`). */
export function isLoopbackAddress(address: string): boolean {
  const ip = address.replace(/^::ffff:/, '');
  return ip === '::1' || /^127(?:\.\d{1,3}){3}$/.test(ip);
}
