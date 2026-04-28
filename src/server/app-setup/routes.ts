import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { parse } from 'valibot';

import { appSetupStateResponseSchema } from '../../shared/acp.ts';
import { listEnabledPresetIds } from '../acp/repositories/provider-catalog-store.ts';
import { errorResponseSchema, jsonResponse } from '../hono-utils.ts';
import { getSetupState, markInitialSetupCompleted } from './app-setup-store.ts';

export const appSetupRoutes = new Hono()
  .get(
    '/',
    describeRoute({
      summary: 'Get application setup state',
      responses: { 200: jsonResponse('Application setup state', appSetupStateResponseSchema) },
    }),
    async (c) => {
      const response = parse(appSetupStateResponseSchema, {
        setup: await getSetupState(),
      });
      return c.json(response);
    },
  )
  .post(
    '/complete',
    describeRoute({
      summary: 'Mark initial application setup completed',
      responses: {
        200: jsonResponse('Application setup state', appSetupStateResponseSchema),
        400: jsonResponse('Application setup completion error', errorResponseSchema),
      },
    }),
    async (c) => {
      const enabledPresetIds = await listEnabledPresetIds();
      if (enabledPresetIds.length === 0) {
        return c.json(
          { error: 'At least one provider must be enabled before setup completes' },
          400,
        );
      }

      const response = parse(appSetupStateResponseSchema, {
        setup: await markInitialSetupCompleted(),
      });
      return c.json(response);
    },
  );
