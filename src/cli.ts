import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCliProgram, type ServeOptions } from './cli-program.pure.ts';

const generateApiKey = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
};

const serve = async (options: ServeOptions): Promise<void> => {
  const [{ envService }, { startServer }] = await Promise.all([
    import('./server/env.ts'),
    import('./server/server.ts'),
  ]);
  const cliDirectory = path.dirname(fileURLToPath(import.meta.url));
  const clientBuildDirectory = path.resolve(cliDirectory, 'client');

  startServer({
    port: envService.getEnv('PORT'),
    clientBuildDirectory: options.serverOnly === true ? undefined : clientBuildDirectory,
  });
};

await createCliProgram({ generateApiKey, serve }).parseAsync();
