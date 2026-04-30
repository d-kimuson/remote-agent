import { describe, expect, test } from 'vitest';

import { createCliProgram, type ServeOptions } from './cli-program.pure.ts';

describe('CLI program', () => {
  test('shows root usage with generate-api-key and serve commands', () => {
    const program = createCliProgram({
      generateApiKey: () => 'test-key',
      serve: () => {},
    });

    const help = program.helpInformation();

    expect(help).toContain('Usage: @kimuson/remote-agent [options] [command]');
    expect(help).toContain('generate-api-key');
    expect(help).toContain('serve [options]');
    expect(help).not.toContain('Usage: @kimuson/remote-agent generate-api-key');
  });

  test('shows serve usage with configuration options', () => {
    const program = createCliProgram({
      generateApiKey: () => 'test-key',
      serve: () => {},
    });
    const serveCommand = program.commands.find((command) => command.name() === 'serve');
    const help = serveCommand?.helpInformation() ?? '';

    expect(help).toContain('--port <port>');
    expect(help).toContain('--tailscale <port>');
    expect(help).toContain('--ra-dir <directory>');
    expect(help).toContain('--ra-api-key <key>');
    expect(help).toContain('--ra-allowed-ips <ips>');
    expect(help).toContain('--ra-allowed-origins <origins>');
  });

  test('requires an explicit command instead of serving by default', async () => {
    let serveOptions: ServeOptions | null = null;
    let help = '';
    const program = createCliProgram({
      generateApiKey: () => 'test-key',
      serve: (options) => {
        serveOptions = options;
      },
    });

    program.exitOverride();
    program.configureOutput({
      writeOut: (output) => {
        help += output;
      },
      writeErr: (output) => {
        help += output;
      },
    });

    await expect(program.parseAsync([], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.help',
    });
    expect(serveOptions).toBeNull();
    expect(help).toContain('Usage: @kimuson/remote-agent [options] [command]');
  });

  test('passes serve options to the serve handler', async () => {
    let serveOptions: ServeOptions | null = null;
    const program = createCliProgram({
      generateApiKey: () => 'test-key',
      serve: (options) => {
        serveOptions = options;
      },
    });

    await program.parseAsync(
      [
        'serve',
        '--port',
        '33333',
        '--tailscale',
        '48989',
        '--ra-dir',
        './data',
        '--ra-api-key',
        'test-key',
        '--ra-allowed-ips',
        '192.168.1.10',
        '--ra-allowed-origins',
        'https://app.example.com',
      ],
      {
        from: 'user',
      },
    );

    expect(serveOptions).toEqual({
      port: '33333',
      raAllowedIps: '192.168.1.10',
      raAllowedOrigins: 'https://app.example.com',
      raApiKey: 'test-key',
      raDir: './data',
      tailscale: '48989',
    });
  });
});
