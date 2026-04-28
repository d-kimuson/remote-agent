import { serve } from '@hono/node-server';

import { createHonoApp } from './app.ts';

type ServerOptions = {
  port?: number;
  clientBuildDirectory?: string;
};

export const startServer = (options?: ServerOptions) => {
  const { port = 8989, clientBuildDirectory } = options ?? {};
  const app = createHonoApp({ clientBuildDirectory });

  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
    },
  );

  let isRunning = true;
  const cleanUp = () => {
    if (isRunning) {
      server.close();
      isRunning = false;
    }
  };

  process.on('SIGINT', () => {
    cleanUp();
  });

  process.on('SIGTERM', () => {
    cleanUp();
  });

  return {
    server,
    cleanUp,
  } as const;
};
