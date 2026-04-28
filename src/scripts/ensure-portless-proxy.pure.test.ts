import { describe, expect, test } from 'vitest';

import { resolvePortlessProxyStartCommand } from './ensure-portless-proxy.pure.ts';

describe('resolvePortlessProxyStartCommand', () => {
  test('skips when PORTLESS_PORT is not set', () => {
    expect(resolvePortlessProxyStartCommand(undefined)).toEqual({ type: 'skip' });
    expect(resolvePortlessProxyStartCommand('')).toEqual({ type: 'skip' });
    expect(resolvePortlessProxyStartCommand('   ')).toEqual({ type: 'skip' });
  });

  test('starts the proxy explicitly when PORTLESS_PORT is set', () => {
    expect(resolvePortlessProxyStartCommand('4444')).toEqual({
      type: 'start',
      port: '4444',
    });
  });

  test('rejects invalid PORTLESS_PORT values', () => {
    expect(() => resolvePortlessProxyStartCommand('abc')).toThrow(
      'Invalid PORTLESS_PORT="abc". Must be an integer from 1 to 65535.',
    );
    expect(() => resolvePortlessProxyStartCommand('65536')).toThrow(
      'Invalid PORTLESS_PORT="65536". Must be an integer from 1 to 65535.',
    );
  });
});
