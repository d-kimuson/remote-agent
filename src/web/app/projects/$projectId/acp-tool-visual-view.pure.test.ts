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

  test('Read path を含む toolName と file_path args を file-read 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        input: {
          toolCallId: 'toolu_1',
          toolName: 'Read docs/tmp/approval-ui-test-trial.md',
          args: {
            file_path: '/home/kaito/repos/remote-agent/docs/tmp/approval-ui-test-trial.md',
          },
        },
        output: '1\t# Approval UI Test\n2\t\n3\t承認UI動作確認用のダミーファイル。\n4\t',
      }),
    );

    expect(visual).toEqual({
      kind: 'file-read',
      path: '/home/kaito/repos/remote-agent/docs/tmp/approval-ui-test-trial.md',
      text: '1\t# Approval UI Test\n2\t\n3\t承認UI動作確認用のダミーファイル。\n4\t',
    });
  });

  test('Cursor CLI の Read File result-only output を file-read 表示に変換する', () => {
    const toolCallId = 'call-read-file\nfc_1';
    const visual = resolveAcpToolVisualView({
      type: 'tool',
      key: `tool-${toolCallId}`,
      toolCallId,
      call: null,
      result: {
        type: 'toolResult',
        toolCallId,
        toolName: 'acp.acp_provider_agent_dynamic_tool',
        outputText: '# Approval UI Tool Test\n\nInitial content for write test.\n',
        rawText: JSON.stringify({
          type: 'tool-result',
          toolCallId,
          toolName: 'acp.acp_provider_agent_dynamic_tool',
          input: {
            toolCallId,
            toolName: 'Read File',
            args: {},
          },
          output: {
            content: '# Approval UI Tool Test\n\nInitial content for write test.\n',
          },
          providerExecuted: true,
        }),
      },
      error: null,
    });

    expect(visual).toEqual({
      kind: 'file-read',
      path: 'Read File',
      text: '# Approval UI Tool Test\n\nInitial content for write test.\n',
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

  test('Cursor CLI の Edit File output diff を diff 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        input: {
          toolCallId: 'call-edit-file\nctc_1',
          toolName: 'Edit File',
          args: {},
        },
        output: [
          {
            newText:
              '++ b//home/kaito/repos/remote-agent/docs/tmp/approval-ui-tool-test.md\n# Approval UI Tool Test\n\nInitial content for write test.',
            oldText: '-- /dev/null\n',
            path: '/home/kaito/repos/remote-agent/docs/tmp/approval-ui-tool-test.md',
            type: 'diff',
          },
        ],
      }),
    );

    expect(visual).toMatchObject({
      kind: 'diff',
      files: [
        {
          filename: '/home/kaito/repos/remote-agent/docs/tmp/approval-ui-tool-test.md',
          linesAdded: 4,
          linesDeleted: 2,
        },
      ],
    });
  });

  test('permission request の fileName/diff raw input を diff 表示に変換する', () => {
    const toolCallId = 'call-1';
    const visual = resolveAcpToolVisualView({
      type: 'tool',
      key: `tool-${toolCallId}`,
      toolCallId,
      call: {
        type: 'toolCall',
        toolCallId,
        toolName: 'Create debug-scratch.txt',
        inputText: JSON.stringify({
          fileName: '/home/kaito/.copilot/session-state/session/files/debug-scratch.txt',
          diff: [
            '',
            'diff --git a/home/kaito/.copilot/session-state/session/files/debug-scratch.txt b/home/kaito/.copilot/session-state/session/files/debug-scratch.txt',
            'create file mode 100644',
            'index 0000000..0000000',
            '--- a/dev/null',
            '+++ b/home/kaito/.copilot/session-state/session/files/debug-scratch.txt',
            '@@ -1,0 +1,2 @@',
            '+debug scratch',
            '+',
            '',
          ].join('\n'),
        }),
        rawText: '',
      },
      result: null,
      error: null,
    });

    expect(visual).toMatchObject({
      kind: 'diff',
      files: [
        {
          filename: '/home/kaito/.copilot/session-state/session/files/debug-scratch.txt',
          isNew: true,
          linesAdded: 2,
          linesDeleted: 0,
        },
      ],
    });
  });

  test('承認待ちの exec_command raw input を terminal 表示に変換する', () => {
    const toolCallId = 'call-1';
    const visual = resolveAcpToolVisualView({
      type: 'tool',
      key: `tool-${toolCallId}`,
      toolCallId,
      call: {
        type: 'toolCall',
        toolCallId,
        toolName: 'Revert README.md and show status',
        inputText: JSON.stringify({
          command: 'git checkout README.md && git status README.md',
          description: 'Revert README.md and show status',
        }),
        rawText: '',
      },
      result: null,
      error: null,
    });

    expect(visual).toEqual({
      kind: 'terminal',
      command: 'git checkout README.md && git status README.md',
      cwd: null,
      stdout: '',
      stderr: '',
      exitCode: null,
      status: null,
      pending: true,
    });
  });

  test('承認待ちの非 JSON command input を terminal 表示に変換する', () => {
    const toolCallId = 'call-1';
    const visual = resolveAcpToolVisualView({
      type: 'tool',
      key: `tool-${toolCallId}`,
      toolCallId,
      call: {
        type: 'toolCall',
        toolCallId,
        toolName: 'echo "second bash approval test" && pwd && date',
        inputText: '`echo "second bash approval test" && pwd && date`',
        rawText: '',
      },
      result: null,
      error: null,
    });

    expect(visual).toEqual({
      kind: 'terminal',
      command: 'echo "second bash approval test" && pwd && date',
      cwd: null,
      stdout: '',
      stderr: '',
      exitCode: null,
      status: null,
      pending: true,
    });
  });

  test('承認待ちの JSON string command input を terminal 表示に変換する', () => {
    const toolCallId = 'call-1';
    const visual = resolveAcpToolVisualView({
      type: 'tool',
      key: `tool-${toolCallId}`,
      toolCallId,
      call: {
        type: 'toolCall',
        toolCallId,
        toolName: 'Preview Request',
        inputText: JSON.stringify('`pwd`'),
        rawText: '',
      },
      result: null,
      error: null,
    });

    expect(visual).toEqual({
      kind: 'terminal',
      command: 'pwd',
      cwd: null,
      stdout: '',
      stderr: '',
      exitCode: null,
      status: null,
      pending: true,
    });
  });

  test('承認待ちの old_string/new_string raw input を diff 表示に変換する', () => {
    const toolCallId = 'call-1';
    const visual = resolveAcpToolVisualView({
      type: 'tool',
      key: `tool-${toolCallId}`,
      toolCallId,
      call: {
        type: 'toolCall',
        toolCallId,
        toolName: 'Edit README.md',
        inputText: JSON.stringify({
          file_path: '/repo/README.md',
          old_string: '2. Open the web UI.',
          new_string: '2. Open the web UI in your browser.',
          replace_all: false,
        }),
        rawText: '',
      },
      result: null,
      error: null,
    });

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

  test('承認待ちの Write raw input を file-read 表示に変換する', () => {
    const toolCallId = 'call-1';
    const visual = resolveAcpToolVisualView({
      type: 'tool',
      key: `tool-${toolCallId}`,
      toolCallId,
      call: {
        type: 'toolCall',
        toolCallId,
        toolName: 'Write approval-test.md',
        inputText: JSON.stringify({
          file_path: '/home/kaito/repos/remote-agent/docs/tmp/approval-test.md',
          content: '# Approval Test\n\n承認UIテスト用のダミーファイル。\n',
        }),
        rawText: '',
      },
      result: null,
      error: null,
    });

    expect(visual).toEqual({
      kind: 'file-read',
      path: '/home/kaito/repos/remote-agent/docs/tmp/approval-test.md',
      text: '# Approval Test\n\n承認UIテスト用のダミーファイル。\n',
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

  test('changes content delete args を diff 表示に変換する', () => {
    const visual = resolveAcpToolVisualView(
      toolItem({
        input: {
          toolCallId: 'call-1',
          toolName: 'Edit /repo/.codex-edit-tool-smoke.txt',
          args: {
            changes: {
              '/repo/.codex-edit-tool-smoke.txt': {
                type: 'delete',
                content: 'temporary edit-tool smoke test\n',
              },
            },
          },
        },
        output: {
          stdout: 'Success. Updated the following files:\nD .codex-edit-tool-smoke.txt\n',
          success: true,
          status: 'completed',
        },
      }),
    );

    expect(visual).toMatchObject({
      kind: 'diff',
      files: [
        {
          filename: '/repo/.codex-edit-tool-smoke.txt',
          isDeleted: true,
          linesAdded: 1,
          linesDeleted: 2,
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

  test('Viewing toolName と path args/content output を file-read 表示に変換する', () => {
    const toolCallId = 'call-1';
    const part = {
      type: 'tool-result',
      toolCallId,
      toolName: 'acp.acp_provider_agent_dynamic_tool',
      input: {
        toolCallId,
        toolName: 'Viewing /home/kaito/repos/remote-agent/README.md',
        args: {
          path: '/home/kaito/repos/remote-agent/README.md',
          view_range: [1, 120],
        },
      },
      output: {
        content: '1. # remote-agent\n2. \n3. body\n',
        detailedContent: 'diff --git ...',
      },
      providerExecuted: true,
    };
    const visual = resolveAcpToolVisualView({
      type: 'tool',
      key: `tool-${toolCallId}`,
      toolCallId,
      call: null,
      result: {
        type: 'toolResult',
        toolCallId,
        toolName: 'acp.acp_provider_agent_dynamic_tool',
        outputText: JSON.stringify(part),
        rawText: JSON.stringify(part),
      },
      error: null,
    });

    expect(visual).toEqual({
      kind: 'file-read',
      path: '/home/kaito/repos/remote-agent/README.md',
      text: '# remote-agent\n\nbody\n',
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
