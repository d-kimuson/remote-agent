import { resolver, type validator as vValidator } from 'hono-openapi';
import { object, string } from 'valibot';

export type ResolverSchema = Parameters<typeof resolver>[0];

export const errorResponseSchema = object({
  error: string(),
});

export const jsonContent = (schema: ResolverSchema) => ({
  'application/json': {
    schema: resolver(schema),
  },
});

export const jsonResponse = (description: string, schema: ResolverSchema) => ({
  description,
  content: jsonContent(schema),
});

export const validationErrorHook = (
  result: Parameters<NonNullable<Parameters<typeof vValidator>[2]>>[0],
  c: Parameters<NonNullable<Parameters<typeof vValidator>[2]>>[1],
) => {
  if (!result.success) {
    return c.json({ error: result.error?.[0]?.message ?? 'invalid request' }, 400);
  }
};
