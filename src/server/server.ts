import { serve } from "@hono/node-server";
import { honoApp } from "./app";

type ServerOptions = {
  port?: number;
};

export const startServer = (options?: ServerOptions) => {
  const { port = 8989 } = options ?? {};

  const server = serve(
    {
      fetch: honoApp.fetch,
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

  process.on("SIGINT", () => {
    cleanUp();
  });

  process.on("SIGTERM", () => {
    cleanUp();
  });

  return {
    server,
    cleanUp,
  } as const;
};
