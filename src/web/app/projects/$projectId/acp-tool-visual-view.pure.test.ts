import { describe, expect, test } from 'vitest';

import type { AcpToolMergeItem } from './acp-event-plan.pure.ts';

import { resolveAcpToolVisualView } from './acp-tool-visual-view.pure.ts';

const toolItem = ({
  input,
  output,
  outerToolName = 'acp.acp_provider_agent_dynamic_tool',
}: {
  readonly input: unknown;
  readonly output: unknown;
  readonly outerToolName?: string;
}): AcpToolMergeItem => {
  const toolCallId = 'call-1';
  return {
    type: 'tool',
    key: `tool-${toolCallId}`,
    toolCallId,
    call: {
      type: 'toolCall',
      toolCallId,
      toolName: outerToolName,
      inputText: JSON.stringify(input, null, 2),
      rawText: JSON.stringify({ toolName: outerToolName, input }, null, 2),
    },
    result: {
      type: 'toolResult',
      toolCallId,
      toolName: outerToolName,
      outputText: JSON.stringify(output, null, 2),
      rawText: JSON.stringify(
        {
          type: 'tool-result',
          toolCallId,
          toolName: outerToolName,
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

  test('Edit old_string/new_string args を diff 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        input: {
          toolCallId: 'call-1',
          toolName: 'Edit README.md',
          args: {
            file_path: '/repo/README.md',
            old_string: '2. Open the web UI.',
            new_string: '2. Open the web UI in your browser.',
          },
        },
        output: 'updated',
      }),
    );

    expect(visual).toMatchObject({
      kind: 'diff',
      files: [
        {
          filename: '/repo/README.md',
          linesAdded: 1,
          linesDeleted: 1,
        },
      ],
    });
  });

  test('changes unified_diff args を diff 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        input: {
          toolCallId: 'call-1',
          toolName: 'Edit /repo/docs/tmp/README-v2.md',
          args: {
            changes: {
              '/repo/docs/tmp/README-v2.md': {
                type: 'update',
                unified_diff: '@@ -26 +26,3 @@\n ## Usage\n+\n+Temporary debug edit marker.\n',
                move_path: null,
              },
            },
          },
        },
        output: {
          stdout: 'Success. Updated the following files:\nM /repo/docs/tmp/README-v2.md\n',
          success: true,
          status: 'completed',
        },
      }),
    );

    expect(visual).toMatchObject({
      kind: 'diff',
      files: [
        {
          filename: '/repo/docs/tmp/README-v2.md',
          linesAdded: 2,
          linesDeleted: 0,
        },
      ],
    });
  });

  test('pi edit path/edits args を diff 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        input: {
          toolCallId: 'call-1',
          toolName: 'edit',
          args: {
            path: '/repo/vite.config.ts',
            edits: [
              {
                oldText: "  test: {\n    env: {\n      RA_RUNTIME: 'dev',\n    },\n  },",
                newText:
                  "  test: {\n    exclude: ['**/.worktrees/**'],\n    env: {\n      RA_RUNTIME: 'dev',\n    },\n  },",
              },
            ],
          },
        },
        output: { content: [{ type: 'text', text: 'ok' }] },
      }),
    );

    expect(visual).toMatchObject({
      kind: 'diff',
      files: [
        {
          filename: '/repo/vite.config.ts',
          linesAdded: 6,
          linesDeleted: 5,
        },
      ],
    });
  });

  test('import された direct exec_command を terminal 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        outerToolName: 'exec_command',
        input: {
          cmd: 'pwd',
          workdir: '/repo',
        },
        output: 'Command: /bin/zsh -lc pwd\nOutput:\n/repo\n',
      }),
    );

    expect(visual).toEqual({
      kind: 'terminal',
      command: 'pwd',
      cwd: '/repo',
      stdout: 'Command: /bin/zsh -lc pwd\nOutput:\n/repo\n',
      stderr: '',
      exitCode: null,
      status: null,
    });
  });

  test('result-only exec_command output を terminal 表示に変換する', () => {
    const toolCallId = 'call-1';
    const visual = resolveAcpToolVisualView({
      type: 'tool',
      key: `tool-${toolCallId}`,
      toolCallId,
      call: null,
      result: {
        type: 'toolResult',
        toolCallId,
        toolName: 'exec_command',
        outputText:
          'Command: /bin/zsh -lc date\nChunk ID: 1acbd3\nWall time: 0.0000 seconds\nProcess exited with code 0\nOriginal token count: 8\nOutput:\nWed Apr 29 23:54:24 JST 2026\n',
        rawText: JSON.stringify({
          type: 'tool-result',
          toolCallId,
          toolName: 'exec_command',
          output:
            'Command: /bin/zsh -lc date\nChunk ID: 1acbd3\nWall time: 0.0000 seconds\nProcess exited with code 0\nOriginal token count: 8\nOutput:\nWed Apr 29 23:54:24 JST 2026\n',
        }),
      },
      error: null,
    });

    expect(visual).toEqual({
      kind: 'terminal',
      command: '/bin/zsh -lc date',
      cwd: null,
      stdout: 'Wed Apr 29 23:54:24 JST 2026\n',
      stderr: '',
      exitCode: 0,
      status: null,
    });
  });

  test('top-level input/output の dynamic tool result を search-results 表示に変換する', () => {
    const toolCallId = 'call-1';
    const visual = resolveAcpToolVisualView({
      type: 'tool',
      key: `tool-${toolCallId}`,
      toolCallId,
      call: null,
      result: {
        type: 'toolResult',
        toolCallId,
        toolName: 'acp.acp_provider_agent_dynamic_tool',
        outputText: 'README.md\ndocs/a.md\n',
        rawText: JSON.stringify({
          type: 'tool-result',
          toolCallId,
          toolName: 'acp.acp_provider_agent_dynamic_tool',
          input: {
            toolCallId,
            toolName: 'Find `*.md`',
            args: { pattern: '*.md' },
          },
          output: 'README.md\ndocs/a.md\n',
          providerExecuted: true,
        }),
      },
      error: null,
    });

    expect(visual).toEqual({
      kind: 'search-results',
      pattern: '*.md',
      filenames: ['README.md', 'docs/a.md'],
      truncated: false,
      durationMs: null,
      numFiles: 2,
    });
  });

  test('単一 read parsed_cmd の command output を file-read 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        input: {
          toolCallId: 'call-1',
          toolName: 'Read README.md',
          args: {
            command: ['/bin/zsh', '-lc', "sed -n '1,20p' README.md"],
            cwd: '/repo',
            parsed_cmd: [
              {
                type: 'read',
                cmd: "sed -n '1,20p' README.md",
                name: 'README.md',
                path: 'README.md',
              },
            ],
          },
        },
        output: {
          stdout: '# remote-agent\n',
          formatted_output: '# remote-agent\n',
        },
      }),
    );

    expect(visual).toEqual({
      kind: 'file-read',
      path: 'README.md',
      text: '# remote-agent\n',
    });
  });

  test('Write args を file-read 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        input: {
          toolCallId: 'call-1',
          toolName: 'Write',
          args: {
            file_path: '/repo/a.txt',
            content: 'hello\n',
          },
        },
        output: 'written',
      }),
    );

    expect(visual).toEqual({
      kind: 'file-read',
      path: '/repo/a.txt',
      text: 'hello\n',
    });
  });
});
