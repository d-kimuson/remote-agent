import { describe, expect, test } from 'vitest';

import {
  applyServeEnvOverrides,
  resolveModePort,
  resolveServeEnvOverrides,
  validateServeOptions,
} from './serve-options.pure.ts';

describe('serve options', () => {
  test('rejects same-LAN and Tailscale at the same time', () => {
    expect(() => validateServeOptions({ sameLan: true, tailscale: true })).toThrow(
      '--same-lan and --tailscale cannot be used together.',
    );
  });

  test('resolves mode port from --port or default', () => {
    expect(resolveModePort({ port: '4444', defaultPort: 8989 })).toBe('4444');
    expect(resolveModePort({ port: undefined, defaultPort: 8989 })).toBe('8989');
  });

  test('maps serve CLI options to RA environment overrides', () => {
    expect(
      resolveServeEnvOverrides({
        raApiKey: 'cli-key',
        raAllowedIps: '192.168.1.10,10.0.0.1',
        raAllowedOrigins: 'https://app.example.com',
        raDir: './state',
      }),
    ).toEqual({
      RA_API_KEY: 'cli-key',
      RA_ALLOWED_IPS: '192.168.1.10,10.0.0.1',
      RA_ALLOWED_ORIGINS: 'https://app.example.com',
      RA_DIR: './state',
    });
  });

  test('preserves environment values unless CLI options are provided', () => {
    const env: NodeJS.ProcessEnv = {
      RA_ALLOWED_IPS: '203.0.113.10',
      RA_ALLOWED_ORIGINS: 'https://env.example.com',
      RA_API_KEY: 'env-key',
      RA_DIR: '/env/state',
    };

    applyServeEnvOverrides(env, {
      raAllowedOrigins: 'https://cli.example.com',
      raDir: '/cli/state',
    });

    expect(env).toEqual({
      RA_ALLOWED_IPS: '203.0.113.10',
      RA_ALLOWED_ORIGINS: 'https://cli.example.com',
      RA_API_KEY: 'env-key',
      RA_DIR: '/cli/state',
    });
  });

  test('does not write missing CLI options into the environment', () => {
    const env: NodeJS.ProcessEnv = {};

    applyServeEnvOverrides(env, {});

    expect(env).toEqual({});
  });
});
