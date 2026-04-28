import { spawnSync } from 'node:child_process';

import { resolvePortlessProxyStartCommand } from './ensure-portless-proxy.pure.ts';

const command = resolvePortlessProxyStartCommand(process.env['PORTLESS_PORT']);

if (command.type === 'start') {
  const result = spawnSync('pnpm', ['portless', 'proxy', 'start', '-p', command.port], {
    env: process.env,
    stdio: 'inherit',
  });

  if (result.signal) {
    throw new Error(`portless proxy start was interrupted by ${result.signal}`);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
