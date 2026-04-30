import type { ServeOptions } from './cli-program.pure.ts';

type ServeEnvOverrides = {
  readonly RA_DIR?: string;
  readonly RA_API_KEY?: string;
  readonly RA_ALLOWED_IPS?: string;
  readonly RA_ALLOWED_ORIGINS?: string;
};

type ServeEnvKey = keyof ServeEnvOverrides;

export const resolveServeEnvOverrides = (options: ServeOptions): ServeEnvOverrides => ({
  ...(options.raDir === undefined ? {} : { RA_DIR: options.raDir }),
  ...(options.raApiKey === undefined ? {} : { RA_API_KEY: options.raApiKey }),
  ...(options.raAllowedIps === undefined ? {} : { RA_ALLOWED_IPS: options.raAllowedIps }),
  ...(options.raAllowedOrigins === undefined
    ? {}
    : { RA_ALLOWED_ORIGINS: options.raAllowedOrigins }),
});

const applyEnvOverride = (
  env: NodeJS.ProcessEnv,
  key: ServeEnvKey,
  value: string | undefined,
): void => {
  if (value !== undefined) {
    env[key] = value;
  }
};

export const applyServeEnvOverrides = (env: NodeJS.ProcessEnv, options: ServeOptions): void => {
  const overrides = resolveServeEnvOverrides(options);
  applyEnvOverride(env, 'RA_DIR', overrides.RA_DIR);
  applyEnvOverride(env, 'RA_API_KEY', overrides.RA_API_KEY);
  applyEnvOverride(env, 'RA_ALLOWED_IPS', overrides.RA_ALLOWED_IPS);
  applyEnvOverride(env, 'RA_ALLOWED_ORIGINS', overrides.RA_ALLOWED_ORIGINS);
};
