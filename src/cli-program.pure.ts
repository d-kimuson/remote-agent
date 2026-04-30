import { Command } from 'commander';

import pkg from '../package.json' with { type: 'json' };

export type ServeOptions = {
  readonly serverOnly?: boolean;
  readonly port?: string;
  readonly tailscale?: string;
  readonly raDir?: string;
  readonly raApiKey?: string;
  readonly raAllowedIps?: string;
  readonly raAllowedOrigins?: string;
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
    .option('--port <port>', 'local server port')
    .option('--tailscale <port>', 'publish through Tailscale Serve on the given HTTPS port')
    .option('--ra-dir <directory>', 'directory for the SQLite database and app state')
    .option('--ra-api-key <key>', 'bearer token required for /api/* requests')
    .option('--ra-allowed-ips <ips>', 'comma-separated IP allowlist')
    .option('--ra-allowed-origins <origins>', 'comma-separated CORS origin allowlist')
    .description('start the remote-agent server')
    .action(async (serveOptions: ServeOptions) => {
      await options.serve(serveOptions);
    });

  return program;
};
