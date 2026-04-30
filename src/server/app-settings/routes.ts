import { Hono } from 'hono';
import { describeRoute, validator as vValidator } from 'hono-openapi';
import { parse } from 'valibot';

import { appSettingsResponseSchema, updateAppSettingsRequestSchema } from '../../shared/acp.ts';
import { errorResponseSchema, jsonResponse, validationErrorHook } from '../hono-utils.ts';
import { getAppSettings, updateAppSettings } from './app-settings-store.ts';

export const appSettingsRoutes = new Hono()
  .get(
    '/',
    describeRoute({
      summary: 'Get application settings',
      responses: { 200: jsonResponse('Application settings', appSettingsResponseSchema) },
    }),
    async (c) => {
      const response = parse(appSettingsResponseSchema, {
        settings: await getAppSettings(),
      });
      return c.json(response);
    },
  )
  .patch(
    '/',
    describeRoute({
      summary: 'Update application settings',
      responses: {
        200: jsonResponse('Application settings', appSettingsResponseSchema),
        400: jsonResponse('Application settings update error', errorResponseSchema),
      },
    }),
    vValidator('json', updateAppSettingsRequestSchema, validationErrorHook),
    async (c) => {
      const response = parse(appSettingsResponseSchema, {
        settings: await updateAppSettings(c.req.valid('json')),
      });
      return c.json(response);
    },
  );
