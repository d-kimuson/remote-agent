export type PortlessProxyStartCommand =
  | {
      readonly type: 'skip';
    }
  | {
      readonly type: 'start';
      readonly port: string;
    };

export const resolvePortlessProxyStartCommand = (
  portlessPort: string | undefined,
): PortlessProxyStartCommand => {
  const trimmedPort = portlessPort?.trim();

  if (trimmedPort === undefined || trimmedPort === '') {
    return { type: 'skip' };
  }

  const port = Number(trimmedPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORTLESS_PORT="${portlessPort}". Must be an integer from 1 to 65535.`);
  }

  return { type: 'start', port: trimmedPort };
};
