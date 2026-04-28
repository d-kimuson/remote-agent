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
        title: 'Remote Agent API',
        version: '0.0.0',
        description: 'API for Remote Agent BFF',
      },
    },
  }),
);

export type HonoAppType = typeof honoApp;
