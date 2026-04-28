import { describe, expect, test } from 'vitest';

import type { AcpToolMergeItem } from './acp-event-plan.pure.ts';

import { resolveAcpToolVisualView } from './acp-tool-visual-view.pure.ts';

const toolItem = ({
  input,
  output,
}: {
  readonly input: unknown;
  readonly output: unknown;
}): AcpToolMergeItem => {
  const toolCallId = 'call-1';
  return {
    type: 'tool',
    key: `tool-${toolCallId}`,
    toolCallId,
    call: {
      type: 'toolCall',
      toolCallId,
      toolName: 'acp.acp_provider_agent_dynamic_tool',
      inputText: JSON.stringify(input, null, 2),
      rawText: JSON.stringify({ toolName: 'acp.acp_provider_agent_dynamic_tool', input }, null, 2),
    },
    result: {
      type: 'toolResult',
      toolCallId,
      toolName: 'acp.acp_provider_agent_dynamic_tool',
      outputText: JSON.stringify(output, null, 2),
      rawText: JSON.stringify(
        {
          type: 'tool-result',
          toolCallId,
          toolName: 'acp.acp_provider_agent_dynamic_tool',
          input,
          output,
          providerExecuted: true,
        },
        null,
        2,
      ),
    },
    error: null,
  };
};

describe('resolveAcpToolVisualView', () => {
  test('bash args と content array output を terminal 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        input: {
          toolCallId: 'call-1',
          toolName: 'bash',
          args: { command: 'pwd && ls', timeout: 10 },
        },
        output: { content: [{ type: 'text', text: '/repo\nREADME.md\n' }] },
      }),
    );

    expect(visual).toEqual({
      kind: 'terminal',
      command: 'pwd && ls',
      cwd: null,
      stdout: '/repo\nREADME.md\n',
      stderr: '',
      exitCode: null,
      status: null,
    });
  });

  test('exec_command 系の JSON output を terminal 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        input: {
          toolCallId: 'call-1',
          toolName: 'Run git diff --stat',
          args: {
            command: ['/bin/zsh', '-lc', 'git diff --stat'],
            cwd: '/repo',
          },
        },
        output: {
          command: ['/bin/zsh', '-lc', 'git diff --stat'],
          cwd: '/repo',
          stdout: ' src/a.ts | 2 +-\n',
          stderr: '',
          exit_code: 0,
          status: 'completed',
          formatted_output: ' src/a.ts | 2 +-\n',
        },
      }),
    );

    expect(visual).toEqual({
      kind: 'terminal',
      command: 'git diff --stat',
      cwd: '/repo',
      stdout: ' src/a.ts | 2 +-\n',
      stderr: '',
      exitCode: 0,
      status: 'completed',
    });
  });

  test('read args と content array output を file-read 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        input: {
          toolCallId: 'call-1',
          toolName: 'read',
          args: { path: 'AGENTS.md', offset: 1, limit: 120 },
        },
        output: { content: [{ type: 'text', text: '# AGENTS\n\nbody\n' }] },
      }),
    );

    expect(visual).toEqual({
      kind: 'file-read',
      path: 'AGENTS.md',
      text: '# AGENTS\n\nbody\n',
    });
  });

  test('pattern args と文字列 output を search-results 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        input: {
          toolCallId: 'call-1',
          toolName: 'Find `*.md`',
          args: { pattern: '*.md' },
        },
        output: 'README.md\ndocs/a.md\n',
      }),
    );

    expect(visual).toEqual({
      kind: 'search-results',
      pattern: '*.md',
      filenames: ['README.md', 'docs/a.md'],
      truncated: false,
      durationMs: null,
      numFiles: 2,
    });
  });
});
