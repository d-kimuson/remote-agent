import { describe, expect, test } from 'vitest';

import { resolveAcpToolCardTitle } from './acp-tool-display-title.pure.ts';

describe('resolveAcpToolCardTitle', () => {
  test('dynamic ツール名のとき input JSON の toolName を出す', () => {
    expect(
      resolveAcpToolCardTitle({
        call: {
          type: 'toolCall',
          toolCallId: '1',
          toolName: 'acp.acp_provider_agent_dynamic_tool',
          inputText: JSON.stringify({ toolName: 'read_file', toolCallId: '1', args: {} }),
          rawText: '',
        },
        result: {
          type: 'toolResult',
          toolCallId: '1',
          toolName: 'acp.acp_provider_agent_dynamic_tool',
          outputText: 'ok',
          rawText: '',
        },
        error: null,
      }),
    ).toBe('read_file');
  });

  test('dynamic ツール名の raw part 形式では input.toolName を出す', () => {
    expect(
      resolveAcpToolCardTitle({
        call: {
          type: 'toolCall',
          toolCallId: 'toolu_1',
          toolName: 'acp.acp_provider_agent_dynamic_tool',
          inputText: JSON.stringify({
            type: 'tool-call',
            toolCallId: 'toolu_1',
            toolName: 'acp.acp_provider_agent_dynamic_tool',
            input: {
              toolCallId: 'toolu_1',
              toolName: 'pwd',
              args: { command: 'pwd', description: 'Print working directory' },
            },
          }),
          rawText: '',
        },
        result: null,
        error: null,
      }),
    ).toBe('pwd');
  });

  test('bash 以外の dynamic ツール名では command をタイトルに含めない', () => {
    expect(
      resolveAcpToolCardTitle({
        call: {
          type: 'toolCall',
          toolCallId: 'toolu_1',
          toolName: 'acp.acp_provider_agent_dynamic_tool',
          inputText: JSON.stringify({
            toolCallId: 'toolu_1',
            toolName: 'List /home/kaito/repos/remote-agent',
            args: {
              command: 'rg --files | head -n 20',
            },
          }),
          rawText: '',
        },
        result: null,
        error: null,
      }),
    ).toBe('List /home/kaito/repos/remote-agent');
  });

  test('edit 完全一致の dynamic ツール名では path をタイトルに含める', () => {
    expect(
      resolveAcpToolCardTitle({
        call: {
          type: 'toolCall',
          toolCallId: 'toolu_1',
          toolName: 'acp.acp_provider_agent_dynamic_tool',
          inputText: JSON.stringify({
            toolCallId: 'toolu_1',
            toolName: 'edit',
            args: {
              path: 'README.md',
              edits: [
                {
                  oldText: 'old',
                  newText: 'new',
                },
              ],
            },
          }),
          rawText: '',
        },
        result: null,
        error: null,
      }),
    ).toBe('edit: README.md');
  });

  test('read 完全一致の dynamic ツール名では path をタイトルに含める', () => {
    expect(
      resolveAcpToolCardTitle({
        call: {
          type: 'toolCall',
          toolCallId: 'toolu_1',
          toolName: 'acp.acp_provider_agent_dynamic_tool',
          inputText: JSON.stringify({
            toolCallId: 'toolu_1',
            toolName: 'read',
            args: {
              path: 'README.md',
            },
          }),
          rawText: '',
        },
        result: null,
        error: null,
      }),
    ).toBe('read: README.md');
  });

  test('bash dynamic ツール名では command をタイトルに含める', () => {
    expect(
      resolveAcpToolCardTitle({
        call: {
          type: 'toolCall',
          toolCallId: 'toolu_1',
          toolName: 'acp.acp_provider_agent_dynamic_tool',
          inputText: JSON.stringify({
            toolCallId: 'toolu_1',
            toolName: 'bash',
            args: {
              command: 'git check-ignore -v docs/tmp/approval-tool-test-2026.md docs/tmp/test.md',
            },
          }),
          rawText: '',
        },
        result: null,
        error: null,
      }),
    ).toBe('bash: git check-ignore -v docs/tmp/approval-tool-test-2026.md docs/tmp/test.md');
  });

  test('長い command タイトルは省略する', () => {
    expect(
      resolveAcpToolCardTitle({
        call: {
          type: 'toolCall',
          toolCallId: 'toolu_1',
          toolName: 'acp.acp_provider_agent_dynamic_tool',
          inputText: JSON.stringify({
            toolCallId: 'toolu_1',
            toolName: 'bash',
            args: {
              command:
                'git check-ignore -v docs/tmp/approval-tool-test-2026.md docs/tmp/test.md docs/tmp/extra.md',
            },
          }),
          rawText: '',
        },
        result: null,
        error: null,
      }),
    ).toBe('bash: git check-ignore -v docs/tmp/approval-tool-test-2026.md docs/tmp...');
  });

  test('result-only dynamic ツール名の raw part 形式では input.toolName を出す', () => {
    expect(
      resolveAcpToolCardTitle({
        call: null,
        result: {
          type: 'toolResult',
          toolCallId: 'toolu_1',
          toolName: 'acp.acp_provider_agent_dynamic_tool',
          outputText: 'README.md\n',
          rawText: JSON.stringify({
            type: 'tool-result',
            toolCallId: 'toolu_1',
            toolName: 'acp.acp_provider_agent_dynamic_tool',
            input: {
              toolCallId: 'toolu_1',
              toolName: 'Find `*.md`',
              args: { pattern: '*.md' },
            },
            output: 'README.md\n',
          }),
        },
        error: null,
      }),
    ).toBe('Find `*.md`');
  });

  test('内訳が取れないときは外側の toolName', () => {
    expect(
      resolveAcpToolCardTitle({
        call: {
          type: 'toolCall',
          toolCallId: '1',
          toolName: 'my_tool',
          inputText: 'not json',
          rawText: '',
        },
        result: null,
        error: null,
      }),
    ).toBe('my_tool');
  });
});
