import { describe, expect, test } from 'vitest';

import {
  buildLanUrls,
  collectLanIPv4Candidates,
  isPrivateIPv4,
  normalizeLocalHostname,
  scoreLanAddressCandidate,
} from './same-lan.pure.ts';

describe('same-LAN pure helpers', () => {
  test('detects RFC1918 private IPv4 ranges', () => {
    expect(isPrivateIPv4('10.0.0.5')).toBe(true);
    expect(isPrivateIPv4('172.16.0.5')).toBe(true);
    expect(isPrivateIPv4('172.31.255.5')).toBe(true);
    expect(isPrivateIPv4('172.32.0.5')).toBe(false);
    expect(isPrivateIPv4('192.168.1.5')).toBe(true);
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
  });

  test('scores physical-looking LAN interfaces above virtual and tunnel interfaces', () => {
    expect(
      scoreLanAddressCandidate({ address: '192.168.1.23', interfaceName: 'en0' }),
    ).toBeGreaterThan(
      scoreLanAddressCandidate({ address: '192.168.64.1', interfaceName: 'bridge100' }),
    );
    expect(scoreLanAddressCandidate({ address: '10.8.0.2', interfaceName: 'utun4' })).toBeLessThan(
      0,
    );
  });

  test('collects private non-internal IPv4 candidates in score order', () => {
    expect(
      collectLanIPv4Candidates({
        lo0: [
          {
            address: '127.0.0.1',
            family: 'IPv4',
            internal: true,
            cidr: '127.0.0.1/8',
            mac: '00:00:00:00:00:00',
            netmask: '255.0.0.0',
            scopeid: 0,
          },
        ],
        bridge100: [
          {
            address: '192.168.64.1',
            family: 'IPv4',
            internal: false,
            cidr: '192.168.64.1/24',
            mac: '00:00:00:00:00:00',
            netmask: '255.255.255.0',
            scopeid: 0,
          },
        ],
        en0: [
          {
            address: '192.168.1.23',
            family: 'IPv4',
            internal: false,
            cidr: '192.168.1.23/24',
            mac: '00:00:00:00:00:00',
            netmask: '255.255.255.0',
            scopeid: 0,
          },
        ],
        utun4: [
          {
            address: '10.8.0.2',
            family: 'IPv4',
            internal: false,
            cidr: '10.8.0.2/24',
            mac: '00:00:00:00:00:00',
            netmask: '255.255.255.0',
            scopeid: 0,
          },
        ],
      }),
    ).toEqual([
      { address: '192.168.1.23', interfaceName: 'en0' },
      { address: '192.168.64.1', interfaceName: 'bridge100' },
      { address: '10.8.0.2', interfaceName: 'utun4' },
    ]);
  });

  test('normalizes local hostnames for .local URLs', () => {
    expect(normalizeLocalHostname('My Mac.local')).toBe('my-mac');
    expect(normalizeLocalHostname('')).toBeNull();
  });

  test('builds an HTTP LAN URL with limited PWA capabilities', () => {
    expect(buildLanUrls({ port: 3000, protocol: 'http', privateIp: '192.168.1.23' })).toEqual({
      primaryUrl: 'http://192.168.1.23:3000',
      fallbackUrls: [],
      capabilities: {
        pwa: false,
        notifications: false,
      },
      warnings: ['HTTP LAN URL has limited features. PWA and notifications require HTTPS.'],
    });
  });

  test('builds an HTTPS mDNS URL with certificate-trust warnings', () => {
    expect(
      buildLanUrls({
        port: 3000,
        protocol: 'https',
        localHostname: 'my-mac',
        privateIp: '192.168.1.23',
      }),
    ).toEqual({
      primaryUrl: 'https://my-mac.local:3000',
      fallbackUrls: ['https://192.168.1.23:3000'],
      capabilities: {
        pwa: true,
        notifications: true,
      },
      warnings: [
        'PWA and notifications require the phone to trust the generated HTTPS certificate.',
      ],
    });
  });
});
