import * as v from "valibot";

const envSchema = v.object({
  PORT: v.pipe(
    v.optional(v.string(), "8989"),
    v.transform((v) => Number.parseInt(v)),
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
