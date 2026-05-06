import type { NetworkInterfaceInfo } from 'node:os';

export type LanAddress = {
  readonly address: string;
  readonly interfaceName: string;
};

export type SameLanProtocol = 'http' | 'https';

export type LanUrlResult = {
  readonly primaryUrl: string;
  readonly fallbackUrls: readonly string[];
  readonly capabilities: {
    readonly pwa: boolean;
    readonly notifications: boolean;
  };
  readonly warnings: readonly string[];
};

export const isPrivateIPv4 = (ip: string): boolean => {
  return (
    ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
};

export const scoreLanAddressCandidate = (candidate: LanAddress): number => {
  const { address, interfaceName } = candidate;
  let score = 0;

  if (address.startsWith('192.168.')) score += 40;
  if (address.startsWith('10.')) score += 35;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) score += 35;

  if (/^(en|eth|wlan|wl|wifi|wi-fi)/i.test(interfaceName)) score += 30;
  if (interfaceName === 'en0') score += 20;

  if (
    /(docker|veth|br-|bridge|vmnet|utun|tun|tap|tailscale|zt|zerotier|wg|vpn)/i.test(interfaceName)
  ) {
    score -= 100;
  }

  if (address.startsWith('169.254.')) {
    score -= 100;
  }

  return score;
};

const isIPv4Family = (family: string | number): boolean => {
  return family === 'IPv4' || family === 4;
};

export const collectLanIPv4Candidates = (
  interfaces: NodeJS.Dict<readonly NetworkInterfaceInfo[]>,
): readonly LanAddress[] => {
  const candidates: LanAddress[] = [];

  for (const [interfaceName, addresses] of Object.entries(interfaces)) {
    for (const item of addresses ?? []) {
      if (!isIPv4Family(item.family)) continue;
      if (item.internal) continue;
      if (!isPrivateIPv4(item.address)) continue;

      candidates.push({
        address: item.address,
        interfaceName,
      });
    }
  }

  return candidates.sort((a, b) => scoreLanAddressCandidate(b) - scoreLanAddressCandidate(a));
};

export const normalizeLocalHostname = (hostname: string): string | null => {
  const firstLabel =
    hostname
      .trim()
      .replace(/\.local\.?$/i, '')
      .split('.')[0] ?? '';
  const normalized = firstLabel
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return normalized.length === 0 ? null : normalized;
};

export const buildLanUrls = ({
  port,
  protocol,
  localHostname,
  privateIp,
}: {
  readonly port: number;
  readonly protocol: SameLanProtocol;
  readonly localHostname?: string;
  readonly privateIp?: string;
}): LanUrlResult => {
  const warnings: string[] = [];
  const fallbackUrls: string[] = [];

  if (protocol === 'https' && localHostname !== undefined) {
    if (privateIp !== undefined) {
      fallbackUrls.push(`https://${privateIp}:${port}`);
    }
    warnings.push(
      'PWA and notifications require the phone to trust the generated HTTPS certificate.',
    );
    return {
      primaryUrl: `https://${localHostname}.local:${port}`,
      fallbackUrls,
      capabilities: {
        pwa: true,
        notifications: true,
      },
      warnings,
    };
  }

  if (privateIp !== undefined) {
    return {
      primaryUrl: `${protocol}://${privateIp}:${port}`,
      fallbackUrls,
      capabilities: {
        pwa: protocol === 'https',
        notifications: protocol === 'https',
      },
      warnings:
        protocol === 'https'
          ? ['PWA and notifications require the phone to trust the generated HTTPS certificate.']
          : ['HTTP LAN URL has limited features. PWA and notifications require HTTPS.'],
    };
  }

  return {
    primaryUrl: `${protocol}://localhost:${port}`,
    fallbackUrls,
    capabilities: {
      pwa: false,
      notifications: false,
    },
    warnings: ['No LAN address was detected.'],
  };
};

export const formatLanAddress = (candidate: LanAddress): string => {
  return `${candidate.address} via ${candidate.interfaceName}`;
};
