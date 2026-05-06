import type { ServerResponse } from 'node:http';

import { getRequestListener, serve } from '@hono/node-server';
import { createServer as createPolyglotServer } from '@httptoolkit/httpolyglot';
import { createServer as createHttpsServer } from 'node:https';

import { createHonoApp } from './app.ts';
import { runDueRoutines } from './routines/routine-runner.ts';

type ServerOptions = {
  port?: number;
  hostname?: string;
  clientBuildDirectory?: string;
  https?: {
    readonly key: string;
    readonly cert: string;
  };
  trustedCertificate?: {
    readonly certificatePem: string;
    readonly fileName: string;
  };
  mobileSetup?: {
    readonly appUrl: string;
    readonly limitedAppUrl: string;
    readonly certificateUrl: string;
  };
  allowHttpCertificateBootstrap?: boolean;
};

const handleListenerError = (outgoing: ServerResponse, error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (!outgoing.headersSent) {
    outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
  }
  if (!outgoing.writableEnded) {
    outgoing.end('Internal Server Error');
  }
};

export const startServer = (options?: ServerOptions) => {
  const {
    port = 8989,
    hostname,
    clientBuildDirectory,
    https,
    trustedCertificate,
    mobileSetup,
    allowHttpCertificateBootstrap = false,
  } = options ?? {};
  const app = createHonoApp({ clientBuildDirectory, trustedCertificate, mobileSetup });

  const scheme = https === undefined ? 'http' : 'https';
  const displayHost = hostname ?? 'localhost';
  const server =
    https !== undefined && allowHttpCertificateBootstrap
      ? createPolyglotServer({ tls: https }, (incoming, outgoing) => {
          // HTTP is intentionally supported on the same port for the limited Private IP app URL.
          const listener = getRequestListener(app.fetch, { hostname });
          void listener(incoming, outgoing).catch((error: unknown) => {
            handleListenerError(outgoing, error);
          });
        }).listen(port, hostname, () => {
          console.log(
            `Server is running on ${scheme}://${displayHost}:${port} (HTTP certificate bootstrap enabled)`,
          );
        })
      : serve(
          {
            fetch: app.fetch,
            port,
            hostname,
            ...(https === undefined
              ? {}
              : {
                  createServer: createHttpsServer,
                  serverOptions: https,
                }),
          },
          (info) => {
            console.log(`Server is running on ${scheme}://${displayHost}:${info.port}`);
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

  return {
    server,
    cleanUp,
  } as const;
};
