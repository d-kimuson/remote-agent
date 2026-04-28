import { Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';

import { routes } from './routes.ts';

export const honoApp = new Hono();
honoApp.route('/api', routes);
honoApp.get(
  '/api/openapi.json',
  openAPIRouteHandler(honoApp, {
    documentation: {
      info: {
        title: 'ACP Playground API',
        version: '0.0.0',
        description: 'API for ACP Playground BFF',
      },
    },
  }),
);

export type HonoAppType = typeof honoApp;
