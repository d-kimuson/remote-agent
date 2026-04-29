import { describe, expect, test } from 'vitest';

import { isAllowedIp, isAuthorizedRequest, requestIpFromHeaders } from './security.pure.ts';

describe('security helpers', () => {
  test('allows requests when API key is unset', () => {
    expect(isAuthorizedRequest({ apiKey: undefined, authorizationHeader: null })).toBe(true);
  });

  test('requires matching bearer token when API key is set', () => {
    expect(
      isAuthorizedRequest({
        apiKey: 'secret',
        authorizationHeader: 'Bearer secret',
      }),
    ).toBe(true);
    expect(
      isAuthorizedRequest({
        apiKey: 'secret',
        authorizationHeader: 'Bearer wrong',
      }),
    ).toBe(false);
  });

  test('accepts query token for transports that cannot set headers', () => {
    expect(
      isAuthorizedRequest({
        apiKey: 'secret',
        authorizationHeader: null,
        queryToken: 'secret',
      }),
    ).toBe(true);
    expect(
      isAuthorizedRequest({
        apiKey: 'secret',
        authorizationHeader: null,
        queryToken: 'wrong',
      }),
    ).toBe(false);
  });

  test('reads client IP from forwarded headers', () => {
    const headers = new Headers({
      'x-forwarded-for': '::ffff:192.168.1.10, 10.0.0.1',
    });

    expect(requestIpFromHeaders(headers)).toBe('192.168.1.10');
  });

  test('allows only configured IP addresses when allowlist is set', () => {
    expect(isAllowedIp({ allowedIps: ['192.168.1.10'], requestIp: '192.168.1.10' })).toBe(true);
    expect(isAllowedIp({ allowedIps: ['192.168.1.10'], requestIp: '10.0.0.1' })).toBe(false);
    expect(isAllowedIp({ allowedIps: [], requestIp: null })).toBe(true);
  });
});
