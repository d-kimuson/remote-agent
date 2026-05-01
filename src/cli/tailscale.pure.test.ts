import { describe, expect, test } from 'vitest';

import {
  buildTailscaleHttpsUrl,
  normalizeTailscaleDnsName,
  parseTcpPort,
} from './tailscale.pure.ts';

describe('Tailscale pure helpers', () => {
  test('parses a valid TCP port', () => {
    expect(parseTcpPort('48989', '--tailscale')).toBe(48989);
  });

  test('rejects invalid TCP ports', () => {
    expect(() => parseTcpPort('0', '--tailscale')).toThrow(
      '--tailscale must be an integer from 1 to 65535.',
    );
    expect(() => parseTcpPort('65536', '--tailscale')).toThrow(
      '--tailscale must be an integer from 1 to 65535.',
    );
    expect(() => parseTcpPort('abc', '--tailscale')).toThrow(
      '--tailscale must be an integer from 1 to 65535.',
    );
  });

  test('normalizes Tailscale DNS names from status JSON', () => {
    expect(normalizeTailscaleDnsName('home-server.tailnet.ts.net.')).toBe(
      'home-server.tailnet.ts.net',
    );
  });

  test('builds HTTPS URLs with explicit ports except 443', () => {
    expect(buildTailscaleHttpsUrl('home-server.tailnet.ts.net.', 48989)).toBe(
      'https://home-server.tailnet.ts.net:48989',
    );
    expect(buildTailscaleHttpsUrl('home-server.tailnet.ts.net.', 443)).toBe(
      'https://home-server.tailnet.ts.net',
    );
  });
});
