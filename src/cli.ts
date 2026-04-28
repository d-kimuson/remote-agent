import { Command } from 'commander';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pkg from '../package.json' with { type: 'json' };
import { envService } from './server/env.ts';
import { startServer } from './server/server.ts';

const program = new Command()
  .name(pkg.name)
  .version(pkg.version)
  .description(pkg.description)
  .option('--server-only', 'start without serving client build')
  .parse();

const { serverOnly } = program.opts<{ serverOnly: boolean }>();

const cliDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientBuildDirectory = path.resolve(cliDirectory, 'client');

startServer({
  port: envService.getEnv('PORT'),
  clientBuildDirectory: serverOnly ? undefined : clientBuildDirectory,
});
