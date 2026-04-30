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
});
