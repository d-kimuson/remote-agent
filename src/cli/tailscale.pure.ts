export const parseTcpPort = (rawPort: string, optionName: string): number => {
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${optionName} must be an integer from 1 to 65535.`);
  }
  return port;
};

export const normalizeTailscaleDnsName = (dnsName: string): string => {
  return dnsName.trim().replace(/\.$/, '');
};

export const buildTailscaleHttpsUrl = (dnsName: string, port: number): string => {
  const normalizedDnsName = normalizeTailscaleDnsName(dnsName);
  if (normalizedDnsName.length === 0) {
    throw new Error('Tailscale DNS name is empty. Check that MagicDNS is enabled.');
  }
  return port === 443 ? `https://${normalizedDnsName}` : `https://${normalizedDnsName}:${port}`;
};
