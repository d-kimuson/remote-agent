import { homedir } from 'node:os';
import path from 'node:path';
import * as v from 'valibot';

const envSchema = v.object({
  PORT: v.pipe(
    v.optional(v.string(), '8989'),
    v.transform((v) => Number.parseInt(v)),
  ),
  RA_RUNTIME: v.optional(v.union([v.literal('dev'), v.literal('production')]), 'production'),
  RA_DIR: v.pipe(
    v.optional(v.string(), path.resolve(homedir(), '.ra')),
    v.transform((value) => path.resolve(value)),
  ),
  RA_API_KEY: v.optional(v.pipe(v.string(), v.trim())),
  RA_ALLOWED_IPS: v.pipe(
    v.optional(v.string(), ''),
    v.transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ),
  RA_ALLOWED_ORIGINS: v.pipe(
    v.optional(v.string(), ''),
    v.transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ),
});

export type Env = v.InferOutput<typeof envSchema>;

export const envService = (() => {
  let env: Env | undefined = undefined;

  const getEnv = <const K extends keyof Env>(key: K) => {
    env ??= v.parse(envSchema, process.env);
    return env[key];
  };
  const resetEnvForTesting = (): void => {
    env = undefined;
  };

  return { getEnv, resetEnvForTesting } as const;
})();
