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
