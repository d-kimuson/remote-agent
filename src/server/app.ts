import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';
import path from 'node:path';

import { routes } from './routes.ts';

type AppOptions = Readonly<{
  clientBuildDirectory?: string;
}>;

const openApiDocument = {
  info: {
    title: 'Remote Agent API',
    version: '0.0.0',
    description: 'API for Remote Agent BFF',
  },
} as const;

export const createHonoApp = (options?: AppOptions) => {
  const app = new Hono();

  app.route('/api', routes);
  app.get(
    '/api/openapi.json',
    openAPIRouteHandler(app, {
      documentation: openApiDocument,
    }),
  );

  const clientBuildDirectory = options?.clientBuildDirectory;
  if (clientBuildDirectory === undefined) {
    return app;
  }

  const staticRoot = path.resolve(clientBuildDirectory);
  const clientApp = new Hono();
  clientApp.use('*', serveStatic({ root: staticRoot }));
  clientApp.get('*', serveStatic({ root: staticRoot, path: './index.html' }));
  app.route('/', clientApp);

  return app;
};

export const honoApp = createHonoApp();

export type HonoAppType = ReturnType<typeof createHonoApp>;
