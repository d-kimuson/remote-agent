import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';
import path from 'node:path';

import { envService } from './env.ts';
import { routes } from './routes.ts';
import { isAllowedIp, isAuthorizedRequest, requestIpFromHeaders } from './security.pure.ts';

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

  app.use('/api/*', async (c, next) => {
    if (
      !isAllowedIp({
        allowedIps: envService.getEnv('RA_ALLOWED_IPS'),
        requestIp: requestIpFromHeaders(c.req.raw.headers),
      })
    ) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    if (
      !isAuthorizedRequest({
        apiKey: envService.getEnv('RA_API_KEY'),
        authorizationHeader: c.req.header('authorization') ?? null,
        queryToken:
          c.req.path === '/api/acp/sse'
            ? (new URL(c.req.url).searchParams.get('ra_api_key') ?? null)
            : null,
      })
    ) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  });

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
