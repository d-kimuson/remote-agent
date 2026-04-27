import path from "node:path";

import * as v from "valibot";

const envSchema = v.object({
  PORT: v.pipe(
    v.optional(v.string(), "8989"),
    v.transform((v) => Number.parseInt(v)),
  ),
  ACP_PLAYGROUND_DB_PATH: v.pipe(
    v.optional(v.string(), path.resolve(process.cwd(), ".local", "acp-playground.sqlite")),
    v.transform((value) => path.resolve(value)),
  ),
});

export type Env = v.InferOutput<typeof envSchema>;

export const envService = (() => {
  let env: Env | undefined = undefined;

  const getEnv = <const K extends keyof Env>(key: K) => {
    env ??= v.parse(envSchema, process.env);
    return env[key];
  };

  return { getEnv } as const;
})();
