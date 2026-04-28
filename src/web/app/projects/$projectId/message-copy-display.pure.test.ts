import { describe, expect, test } from 'vitest';

import type { ChatMessage } from '../../../../shared/acp.ts';

import { shouldShowMessageCopyButton } from './message-copy-display.pure.ts';

const baseMessage = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  role: 'assistant',
  text: '',
  rawEvents: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('shouldShowMessageCopyButton', () => {
  test('hides outer copy for merged tool-only legacy messages', () => {
    expect(
      shouldShowMessageCopyButton(
        baseMessage({
          kind: 'legacy_assistant_turn',
          rawEvents: [
            {
              type: 'toolCall',
              toolCallId: 'call-1',
              toolName: 'read_file',
              inputText: '{}',
              rawText: '',
            },
            {
              type: 'toolResult',
              toolCallId: 'call-1',
              toolName: 'read_file',
              outputText: 'ok',
              rawText: '',
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  test('shows outer copy when assistant text is present', () => {
    expect(
      shouldShowMessageCopyButton(
        baseMessage({
          text: '本文',
          rawEvents: [
            {
              type: 'toolCall',
              toolCallId: 'call-1',
              toolName: 'read_file',
              inputText: '{}',
              rawText: '',
            },
          ],
        }),
      ),
    ).toBe(true);
  });
});
