import { describe, expect, test } from 'vitest';

import { applyServeEnvOverrides, resolveServeEnvOverrides } from './serve-options.pure.ts';

describe('serve options', () => {
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
