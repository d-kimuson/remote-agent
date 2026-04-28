import { describe, expect, test } from 'vitest';

import { normalizeFailedToolResultForAcpProvider } from './acp-provider-tool-result-patch.ts';

describe('normalizeFailedToolResultForAcpProvider', () => {
  test('wraps failed non-array tool results in ACP text content blocks', () => {
    const normalized = normalizeFailedToolResultForAcpProvider({
      toolCallId: 'call-1',
      toolName: 'Run git diff',
      toolResult: {
        call_id: 'call-1',
        exit_code: 1,
        stderr: 'fatal: pathspec did not match any files',
      },
      isError: true,
      status: 'failed',
    });

    expect(normalized).toEqual({
      toolCallId: 'call-1',
      toolName: 'Run git diff',
      toolResult: [
        {
          type: 'content',
          content: {
            type: 'text',
            text: JSON.stringify(
              {
                call_id: 'call-1',
                exit_code: 1,
                stderr: 'fatal: pathspec did not match any files',
              },
              null,
              2,
            ),
          },
        },
      ],
      isError: true,
      status: 'failed',
    });
  });

  test('preserves completed structured tool results', () => {
    const parsed = {
      toolCallId: 'call-2',
      toolName: 'Read file',
      toolResult: { output: 'ok' },
      isError: false,
      status: 'completed',
    };

    expect(normalizeFailedToolResultForAcpProvider(parsed)).toBe(parsed);
  });

  test('preserves failed array tool results', () => {
    const parsed = {
      toolCallId: 'call-3',
      toolName: 'Run command',
      toolResult: [{ type: 'content', content: { type: 'text', text: 'failed' } }],
      isError: true,
      status: 'failed',
    };

    expect(normalizeFailedToolResultForAcpProvider(parsed)).toBe(parsed);
  });
});
