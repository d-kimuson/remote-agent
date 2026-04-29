import { describe, expect, test } from 'vitest';

import type { ChatMessage } from '../../../../shared/acp.ts';

import {
  acpSessionUpdateFromMessage,
  acpToolStatusUpdateFromMessage,
  latestAcpUsageUpdate,
  latestAvailableSlashCommands,
  vscodeFileUri,
} from './acp-session-meta.pure.ts';

const metaMessage = (metadata: unknown): ChatMessage => ({
  id: crypto.randomUUID(),
  role: 'assistant',
  kind: 'raw_meta',
  text: '',
  rawEvents: [],
  createdAt: '2026-04-29T00:00:00.000Z',
  metadataJson: JSON.stringify(metadata),
});

describe('acp-session-meta.pure', () => {
  test('reads latest usage update', () => {
    const usage = latestAcpUsageUpdate([
      metaMessage({ acpSessionUpdate: { sessionUpdate: 'usage_update', used: 10, size: 100 } }),
      metaMessage({
        acpSessionUpdate: {
          sessionUpdate: 'usage_update',
          used: 20,
          size: 100,
          cost: { amount: 0.25, currency: 'USD' },
        },
      }),
    ]);

    expect(usage).toEqual({
      sessionUpdate: 'usage_update',
      used: 20,
      size: 100,
      cost: { amount: 0.25, currency: 'USD' },
    });
  });

  test('maps latest available commands to slash command options', () => {
    const commands = latestAvailableSlashCommands([
      metaMessage({
        acpSessionUpdate: {
          sessionUpdate: 'available_commands_update',
          availableCommands: [
            { name: 'review', description: 'Review changes', input: { hint: 'scope' } },
          ],
        },
      }),
    ]);

    expect(commands).toEqual([
      { name: 'review', description: 'Review changes', inputHint: 'scope' },
    ]);
  });

  test('reads session info updates', () => {
    expect(
      acpSessionUpdateFromMessage(
        metaMessage({
          acpSessionUpdate: {
            sessionUpdate: 'session_info_update',
            title: 'Agent title',
            updatedAt: '2026-04-29T00:01:00.000Z',
          },
        }),
      ),
    ).toEqual({
      sessionUpdate: 'session_info_update',
      title: 'Agent title',
      updatedAt: '2026-04-29T00:01:00.000Z',
    });
  });

  test('reads tool status update locations', () => {
    const update = acpToolStatusUpdateFromMessage(
      metaMessage({
        acpSessionUpdate: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tool-1',
          status: 'in_progress',
          locations: [{ path: '/repo/src/app.ts', line: 12 }],
        },
      }),
    );

    expect(update?.locations).toEqual([{ path: '/repo/src/app.ts', line: 12 }]);
  });

  test('builds vscode file jump URI', () => {
    expect(vscodeFileUri({ path: '/repo/src/app.ts', line: 12 })).toBe(
      'vscode://file//repo/src/app.ts:12',
    );
  });

  test('resolves relative tool locations from session cwd', () => {
    expect(vscodeFileUri({ cwd: '/repo/worktree', path: 'src/app #1.ts', line: 12 })).toBe(
      'vscode://file//repo/worktree/src/app%20%231.ts:12',
    );
  });
});
