import { describe, expect, test } from 'vitest';

import { parseArgsText, parseCommandLine } from './args.pure';

describe('parseArgsText', () => {
  test('splits newline separated arguments', () => {
    expect(parseArgsText('--foo\nbar\nbaz')).toEqual(['--foo', 'bar', 'baz']);
  });

  test('drops blank lines and trims spaces', () => {
    expect(parseArgsText('  --alpha  \n\n beta \n')).toEqual(['--alpha', 'beta']);
  });

  test('returns an empty list for undefined', () => {
    expect(parseArgsText(undefined)).toEqual([]);
  });
});

describe('parseCommandLine', () => {
  test('splits command and arguments', () => {
    expect(parseCommandLine('opencode acp --cwd /tmp/project')).toEqual({
      ok: true,
      command: 'opencode',
      args: ['acp', '--cwd', '/tmp/project'],
    });
  });

  test('keeps quoted arguments together', () => {
    expect(parseCommandLine('custom-agent --label "hello world"')).toEqual({
      ok: true,
      command: 'custom-agent',
      args: ['--label', 'hello world'],
    });
  });

  test('returns an error for blank input', () => {
    expect(parseCommandLine('  ')).toEqual({
      ok: false,
      error: 'Command is required.',
    });
  });

  test('returns an error for unterminated quotes', () => {
    expect(parseCommandLine('custom-agent "oops')).toEqual({
      ok: false,
      error: 'Command has an unterminated quote.',
    });
  });
});
