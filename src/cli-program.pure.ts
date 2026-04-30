import { Command } from 'commander';

import pkg from '../package.json' with { type: 'json' };

export type ServeOptions = {
  readonly serverOnly?: boolean;
};

type CliProgramOptions = {
  readonly generateApiKey: () => string;
  readonly serve: (options: ServeOptions) => void | Promise<void>;
};

export const createCliProgram = (options: CliProgramOptions): Command => {
  const program = new Command()
    .name(pkg.name)
    .version(pkg.version)
    .description(pkg.description)
    .action(() => {
      program.help({ error: true });
    });

  program
    .command('generate-api-key')
    .description('generate an API key for RA_API_KEY')
    .action(() => {
      console.log(options.generateApiKey());
    });

  program
    .command('serve')
    .option('--server-only', 'start without serving client build')
    .description('start the remote-agent server')
    .action(async (serveOptions: ServeOptions) => {
      await options.serve(serveOptions);
    });

  return program;
};
