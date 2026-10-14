import { describe, expect, test } from 'vitest';

import type { ChatMessage } from '../../../../shared/acp.ts';

import { shouldRenderMessageAsStreamingPlainText } from './message-content-phase.pure.ts';

const assistantText = (id: string, text: string): ChatMessage => ({
  id,
  role: 'assistant',
  kind: 'assistant_text',
  rawJson: {
    schemaVersion: 1,
    type: 'assistant_text',
    role: 'assistant',
    streamPartId: id,
    providerStreamId: id,
    text,
    deltaCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  textForSearch: text,
  text,
  rawEvents: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  streamPartId: id,
});

describe('shouldRenderMessageAsStreamingPlainText', () => {
  test('uses plain text only for the last assistant text message while busy', () => {
    const message = assistantText('a', 'Hello');
    expect(
      shouldRenderMessageAsStreamingPlainText({
        isLastMessage: true,
        isTurnBusy: true,
        message,
      }),
    ).toBe(true);
    expect(
      shouldRenderMessageAsStreamingPlainText({
        isLastMessage: false,
        isTurnBusy: true,
        message,
      }),
    ).toBe(false);
    expect(
      shouldRenderMessageAsStreamingPlainText({
        isLastMessage: true,
        isTurnBusy: false,
        message,
      }),
    ).toBe(false);
  });
});
