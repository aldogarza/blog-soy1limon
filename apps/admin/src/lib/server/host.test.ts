import { describe, expect, it } from 'vitest';
import { isLoopbackAddress, isLoopbackHost } from './host.ts';

describe('isLoopbackHost', () => {
  it.each(['127.0.0.1:4322', 'localhost:4322', 'localhost', '[::1]:4322'])('accepts %s', (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });

  it.each([
    null,
    '',
    'evil.example',
    'evil.example:4322',
    '127.0.0.1.evil.example',
    '192.168.1.5:4322',
    'localhost.evil.example',
  ])('rejects %s (DNS rebinding / LAN access)', (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});

describe('isLoopbackAddress', () => {
  it.each(['127.0.0.1', '127.0.0.53', '::1', '::ffff:127.0.0.1'])('accepts %s', (address) => {
    expect(isLoopbackAddress(address)).toBe(true);
  });

  it.each(['192.168.1.20', '10.0.0.1', '::ffff:192.168.1.20', 'fe80::1', '1127.0.0.1'])(
    'rejects %s',
    (address) => {
      expect(isLoopbackAddress(address)).toBe(false);
    },
  );
});
