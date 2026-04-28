import { describe, expect, test } from 'vitest';

import type { ChatMessage, RawEvent } from '../../../../shared/acp.ts';

import {
  chatMessageClipboardText,
  rawEventClipboardText,
  toolBlockClipboardText,
} from './chat-block-copy.pure.ts';

const baseMessage = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  role: 'assistant',
  text: '',
  rawEvents: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('rawEventClipboardText', () => {
  test('plan entries are copied as a readable block', () => {
    const event: RawEvent = {
      type: 'plan',
      entries: ['調査', '実装'],
      rawText: '',
    };

    expect(rawEventClipboardText(event)).toBe('プラン (plan)\n調査\n実装');
  });

  test('diff keeps old and new text labels', () => {
    const event: RawEvent = {
      type: 'diff',
      path: 'src/app.ts',
      oldText: 'old',
      newText: 'new',
      rawText: '',
    };

    expect(rawEventClipboardText(event)).toBe('差分 · src/app.ts\n--- old\nold\n--- new\nnew');
  });
});

describe('toolBlockClipboardText', () => {
  test('joins args and output in one copy payload', () => {
    expect(
      toolBlockClipboardText({
        type: 'tool',
        key: 'tool-1',
        toolCallId: '1',
        call: {
          type: 'toolCall',
          toolCallId: '1',
          toolName: 'Read',
          inputText: '{"file":"a.ts"}',
          rawText: '',
        },
        result: {
          type: 'toolResult',
          toolCallId: '1',
          toolName: 'Read',
          outputText: 'content',
          rawText: '',
        },
        error: null,
      }),
    ).toBe('入力 (args) · Read\n{"file":"a.ts"}\n\n戻り値 (output) · Read\ncontent');
  });
});

describe('chatMessageClipboardText', () => {
  test('combines assistant text and raw event blocks', () => {
    expect(
      chatMessageClipboardText(
        baseMessage({
          text: '本文',
          rawEvents: [{ type: 'terminal', terminalId: null, text: 'pnpm test', rawText: '' }],
        }),
      ),
    ).toBe('本文\n\nターミナル (terminal)\npnpm test');
  });
});
