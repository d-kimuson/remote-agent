import { describe, expect, test } from 'vitest';

import { parseCliArgs } from './cli.pure.ts';

describe('parseCliArgs', () => {
  test('parses server-only flag', () => {
    const result = parseCliArgs(['--server-only']);

    expect(result).toEqual({
      type: 'success',
      value: {
        serverOnly: true,
      },
    });
  });

  test('returns help for help flag', () => {
    const result = parseCliArgs(['--help']);

    expect(result).toEqual({
      type: 'help',
      usage: 'Usage: remote-agent [--server-only]',
    });
  });

  test('rejects unknown arguments', () => {
    const result = parseCliArgs(['--wat']);

    expect(result).toEqual({
      type: 'error',
      message: 'Unknown argument: --wat',
      usage: 'Usage: remote-agent [--server-only]',
    });
  });
});
