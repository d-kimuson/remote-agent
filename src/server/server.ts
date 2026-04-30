import { serve } from '@hono/node-server';

import { createHonoApp } from './app.ts';
import { runDueRoutines } from './routines/routine-runner.ts';

type ServerOptions = {
  port?: number;
  hostname?: string;
  clientBuildDirectory?: string;
};

export const startServer = (options?: ServerOptions) => {
  const { port = 8989, hostname, clientBuildDirectory } = options ?? {};
  const app = createHonoApp({ clientBuildDirectory });

  const server = serve(
    {
      fetch: app.fetch,
      port,
      hostname,
    },
    (info) => {
      const displayHost = hostname ?? 'localhost';
      console.log(`Server is running on http://${displayHost}:${info.port}`);
    },
  );

  const routineInterval = setInterval(() => {
    void runDueRoutines();
  }, 30_000);
  void runDueRoutines();

  let isRunning = true;
  const cleanUp = () => {
    if (isRunning) {
      clearInterval(routineInterval);
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
