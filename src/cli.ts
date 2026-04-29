import { Command } from 'commander';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pkg from '../package.json' with { type: 'json' };
import { envService } from './server/env.ts';
import { startServer } from './server/server.ts';

const generateApiKey = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
};

const program = new Command()
  .name(pkg.name)
  .version(pkg.version)
  .description(pkg.description)
  .command('generate-api-key')
  .description('generate an API key for RA_API_KEY')
  .action(() => {
    console.log(generateApiKey());
  });

program
  .command('serve', { isDefault: true })
  .option('--server-only', 'start without serving client build')
  .description('start the remote-agent server')
  .action((options: { readonly serverOnly?: boolean }) => {
    const cliDirectory = path.dirname(fileURLToPath(import.meta.url));
    const clientBuildDirectory = path.resolve(cliDirectory, 'client');

    startServer({
      port: envService.getEnv('PORT'),
      clientBuildDirectory: options.serverOnly === true ? undefined : clientBuildDirectory,
    });
  });

program.parse();
