import Bonjour from 'bonjour-service';
import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';
import QRCode from 'qrcode';
import { generate } from 'selfsigned';

import {
  buildLanUrls,
  collectLanIPv4Candidates,
  formatLanAddress,
  normalizeLocalHostname,
  type LanAddress,
  type SameLanProtocol,
} from './same-lan.pure.ts';

export type SameLanCertificateAuthority = {
  readonly key: string;
  readonly cert: string;
  readonly certPath: string;
};

type SameLanHttpsCredentialsInput = {
  readonly localHostname: string | null;
  readonly lanAddresses: readonly LanAddress[];
  readonly certificateAuthority: SameLanCertificateAuthority;
};

export type SameLanHttpsCredentials = {
  readonly key: string;
  readonly cert: string;
};

export type SameLanMdnsAdvertisement = {
  readonly status: 'published' | 'failed' | 'skipped';
  readonly warning?: string;
  readonly cleanUp: () => void;
};

const execFileAsync = promisify(execFile);

const unique = (values: readonly string[]): readonly string[] => [...new Set(values)];

const normalizeFingerprint = (value: string): string => value.replaceAll(':', '').toUpperCase();

const certificateFingerprintSha256 = (certificatePem: string): string => {
  return normalizeFingerprint(new X509Certificate(certificatePem).fingerprint256);
};

const certificateFingerprintSha1 = (certificatePem: string): string => {
  return normalizeFingerprint(new X509Certificate(certificatePem).fingerprint);
};

const certificateCommonName = (certificatePem: string): string => {
  const subject = new X509Certificate(certificatePem).subject;
  const commonName = subject
    .split('\n')
    .find((part) => part.startsWith('CN='))
    ?.slice(3)
    .trim();
  return commonName === undefined || commonName.length === 0 ? 'remote-agent local CA' : commonName;
};

const sameLanCertificateAuthorityCommonName = (
  localHostname: string | null | undefined,
): string => {
  return localHostname === null || localHostname === undefined
    ? 'remote-agent local CA'
    : `remote-agent local CA (${localHostname}.local)`;
};

const sameLanCertificateDirectory = (raDirectory: string): string => {
  return `${raDirectory}/certificates`;
};

const caKeyPath = (raDirectory: string): string => {
  return `${sameLanCertificateDirectory(raDirectory)}/remote-agent-local-ca.key`;
};

const caCertPath = (raDirectory: string): string => {
  return `${sameLanCertificateDirectory(raDirectory)}/remote-agent-local-ca.crt`;
};

export const ensureSameLanCertificateAuthority = async (
  raDirectory: string,
  localHostname?: string | null,
): Promise<SameLanCertificateAuthority> => {
  const keyPath = caKeyPath(raDirectory);
  const certPath = caCertPath(raDirectory);
  if (existsSync(keyPath) && existsSync(certPath)) {
    const [key, cert] = await Promise.all([readFile(keyPath, 'utf8'), readFile(certPath, 'utf8')]);
    return { key, cert, certPath };
  }

  await mkdir(sameLanCertificateDirectory(raDirectory), { recursive: true });
  const pems = await generate(
    [{ name: 'commonName', value: sameLanCertificateAuthorityCommonName(localHostname) }],
    {
      algorithm: 'sha256',
      notAfterDate: new Date(Date.now() + 825 * 24 * 60 * 60 * 1000),
      extensions: [
        { name: 'basicConstraints', cA: true, critical: true },
        { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
      ],
    },
  );

  await Promise.all([
    writeFile(keyPath, pems.private, { mode: 0o600 }),
    writeFile(certPath, pems.cert),
  ]);
  return {
    key: pems.private,
    cert: pems.cert,
    certPath,
  };
};

export const isSameLanCertificateAuthorityTrustedForCurrentUser = async (
  certificateAuthority: SameLanCertificateAuthority,
): Promise<boolean> => {
  const commonName = certificateCommonName(certificateAuthority.cert);
  const sha256 = certificateFingerprintSha256(certificateAuthority.cert);
  const sha1 = certificateFingerprintSha1(certificateAuthority.cert);

  if (process.platform === 'darwin') {
    const { stdout } = await execFileAsync('security', [
      'find-certificate',
      '-a',
      '-Z',
      '-c',
      commonName,
    ]).catch(() => ({ stdout: '' }));
    return normalizeFingerprint(stdout).includes(sha256);
  }

  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync('certutil', [
      '-user',
      '-store',
      'Root',
      commonName,
    ]).catch(() => ({ stdout: '' }));
    const normalizedOutput = normalizeFingerprint(stdout);
    return normalizedOutput.includes(sha256) || normalizedOutput.includes(sha1);
  }

  return false;
};

export const installSameLanCertificateAuthorityForCurrentUser = async (
  certificateAuthority: SameLanCertificateAuthority,
): Promise<void> => {
  if (process.platform === 'darwin') {
    await execFileAsync('security', [
      'add-trusted-cert',
      '-d',
      '-r',
      'trustRoot',
      '-k',
      `${os.homedir()}/Library/Keychains/login.keychain-db`,
      certificateAuthority.certPath,
    ]);
    return;
  }

  if (process.platform === 'win32') {
    await execFileAsync('certutil', ['-user', '-addstore', 'Root', certificateAuthority.certPath]);
    return;
  }

  throw new Error(
    `Automatic certificate installation is not supported on ${process.platform}. Install ${certificateAuthority.certPath} manually.`,
  );
};

export const getLanIPv4Candidates = () => collectLanIPv4Candidates(os.networkInterfaces());

export const getLocalHostname = (): string | null => normalizeLocalHostname(os.hostname());

export const createSameLanHttpsCredentials = async ({
  localHostname,
  lanAddresses,
  certificateAuthority,
}: SameLanHttpsCredentialsInput): Promise<SameLanHttpsCredentials> => {
  const dnsNames = unique([
    ...(localHostname === null ? [] : [`${localHostname}.local`, localHostname]),
    'localhost',
  ]);
  const ipAddresses = unique(['127.0.0.1', ...lanAddresses.map((candidate) => candidate.address)]);
  const commonName = localHostname === null ? 'localhost' : `${localHostname}.local`;
  const pems = await generate([{ name: 'commonName', value: commonName }], {
    algorithm: 'sha256',
    notAfterDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ca: {
      key: certificateAuthority.key,
      cert: certificateAuthority.cert,
    },
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      {
        name: 'extKeyUsage',
        serverAuth: true,
      },
      {
        name: 'subjectAltName',
        altNames: [
          ...dnsNames.map((value) => ({ type: 2 as const, value })),
          ...ipAddresses.map((ip) => ({ type: 7 as const, ip })),
        ],
      },
    ],
  });

  return {
    key: pems.private,
    cert: pems.cert,
  };
};

export const startSameLanMdnsAdvertisement = ({
  port,
  localHostname,
}: {
  readonly port: number;
  readonly localHostname: string | null;
}): SameLanMdnsAdvertisement => {
  if (localHostname === null) {
    return {
      status: 'skipped',
      warning: 'mDNS URL was skipped because the local hostname could not be determined.',
      cleanUp: () => {},
    };
  }

  try {
    const bonjour = new Bonjour(undefined, (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`mDNS error: ${message}`);
    });
    const service = bonjour.publish({
      name: 'remote-agent',
      type: 'https',
      port,
      host: `${localHostname}.local`,
      txt: {
        app: 'remote-agent',
      },
    });

    service.on('error', (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`mDNS publish error: ${message}`);
    });

    return {
      status: 'published',
      cleanUp: () => {
        bonjour.unpublishAll(() => {
          bonjour.destroy();
        });
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'failed',
      warning: `mDNS advertisement failed: ${message}`,
      cleanUp: () => {},
    };
  }
};

export const renderSameLanTerminalQrCode = async (text: string): Promise<string> => {
  return QRCode.toString(text, {
    type: 'terminal',
    small: true,
  });
};

export const printSameLanAccessInfo = async ({
  port,
  protocol,
  localHostname,
  candidates,
  mdnsAdvertisement,
  certificateAuthority,
}: {
  readonly port: number;
  readonly protocol: SameLanProtocol;
  readonly localHostname: string | null;
  readonly candidates: readonly LanAddress[];
  readonly mdnsAdvertisement: SameLanMdnsAdvertisement;
  readonly certificateAuthority: SameLanCertificateAuthority;
}): Promise<void> => {
  const selectedCandidate = candidates[0];
  const lanUrls = buildLanUrls({
    port,
    protocol,
    localHostname: localHostname ?? undefined,
    privateIp: selectedCandidate?.address,
  });
  const setupUrl =
    selectedCandidate === undefined
      ? `${lanUrls.primaryUrl}/setup-mobile-crt`
      : `http://${selectedCandidate.address}:${port}/setup-mobile-crt`;
  const setupQrCode = await renderSameLanTerminalQrCode(setupUrl);

  const limitedUrl =
    selectedCandidate === undefined
      ? `http://localhost:${port}`
      : `http://${selectedCandidate.address}:${port}`;
  const otherCandidates = candidates.slice(1);
  const warnings = [
    ...lanUrls.warnings,
    ...(mdnsAdvertisement.warning === undefined ? [] : [mdnsAdvertisement.warning]),
  ];

  console.log('');
  console.log('Same-LAN access ready');
  console.log(`  Setup page:      ${setupUrl}`);
  console.log(`  Full HTTPS app:  ${lanUrls.primaryUrl}`);
  console.log(`  Limited HTTP:    ${limitedUrl}`);
  console.log(`  Local PC:        ${protocol}://localhost:${port}`);
  console.log(`  CA certificate:  ${certificateAuthority.certPath}`);

  if (selectedCandidate !== undefined) {
    console.log('');
    console.log('Detected LAN address:');
    console.log(`  ${formatLanAddress(selectedCandidate)}`);
  }

  if (otherCandidates.length > 0) {
    console.log('');
    console.log('Other detected addresses:');
    for (const candidate of otherCandidates) {
      console.log(`  ${formatLanAddress(candidate)}`);
    }
  }

  if (warnings.length > 0) {
    console.log('');
    console.log('Notes:');
    console.log('  Open the setup page on your phone. It includes certificate install steps.');
    for (const warning of warnings) {
      console.log(`  ${warning}`);
    }
  }

  console.log('');
  console.log('Mobile setup QR Code:');
  console.log(setupQrCode);
};
