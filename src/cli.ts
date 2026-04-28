import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCliArgs } from './server/cli.pure.ts';
import { envService } from './server/env.ts';
import { startServer } from './server/server.ts';

const parsed = parseCliArgs(process.argv.slice(2));

if (parsed.type === 'help') {
  console.log(parsed.usage);
  process.exit(0);
}

if (parsed.type === 'error') {
  console.error(parsed.message);
  console.error(parsed.usage);
  process.exit(1);
}

const cliDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientBuildDirectory = path.resolve(cliDirectory, 'client');

startServer({
  port: envService.getEnv('PORT'),
  clientBuildDirectory: parsed.value.serverOnly ? undefined : clientBuildDirectory,
});
