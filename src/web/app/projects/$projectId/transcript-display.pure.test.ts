import { describe, expect, test } from 'vitest';

import type { ChatMessage, RawEvent } from '../../../../shared/acp';

import {
  filterDisplayableRawEvents,
  isToolOnlyTranscriptMessage,
  shouldDisplayTranscriptMessage,
} from './transcript-display.pure.ts';

const baseMeta = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  role: 'assistant',
  kind: 'legacy_assistant_turn',
  rawJson: {
    schemaVersion: 1,
    type: 'legacy_assistant_turn',
    role: 'assistant',
    text: '',
    rawEvents: [],
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  textForSearch: '',
  text: '',
  rawEvents: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

describe('filterDisplayableRawEvents', () => {
  test('空の start と start-step を除く', () => {
    const events: RawEvent[] = [
      { type: 'streamPart', partType: 'start', text: '', rawText: '' },
      { type: 'streamPart', partType: 'start-step', text: '{}', rawText: '{}' },
      { type: 'streamPart', partType: 'finish', text: 'x', rawText: 'x' },
      { type: 'reasoning', text: 'q', rawText: 'q' },
    ];
    const next = filterDisplayableRawEvents(events);
    expect(next).toEqual([
      { type: 'streamPart', partType: 'finish', text: 'x', rawText: 'x' },
      { type: 'reasoning', text: 'q', rawText: 'q' },
    ]);
  });

  test('空でない start は残す', () => {
    const events: RawEvent[] = [{ type: 'streamPart', partType: 'start', text: 'x', rawText: 'x' }];
    expect(filterDisplayableRawEvents(events).length).toBe(1);
  });
});

describe('shouldDisplayTranscriptMessage', () => {
  test('隠し種別の assistant は出さない', () => {
    for (const kind of [
      'stream_start',
      'step_start',
      'stream_finish',
      'step_finish',
      'raw_meta',
    ] as const) {
      expect(
        shouldDisplayTranscriptMessage(baseMeta({ kind, text: '{}', rawEvents: [] }), []),
      ).toBe(false);
    }
  });

  test('空本文・空イベントの assistant leg は出さない', () => {
    expect(shouldDisplayTranscriptMessage(baseMeta({ kind: 'tool_call' }), [])).toBe(false);
  });

  test('rawEvents だけの assistant は出す', () => {
    const ev: RawEvent = {
      type: 'toolCall',
      toolCallId: '1',
      toolName: 'x',
      inputText: '{}',
      rawText: '{}',
    };
    expect(shouldDisplayTranscriptMessage(baseMeta({ text: '', rawEvents: [ev] }), [ev])).toBe(
      true,
    );
  });
});

describe('isToolOnlyTranscriptMessage', () => {
  test('本文なしでツールイベントのみの assistant を true にする', () => {
    const ev: RawEvent = {
      type: 'toolCall',
      toolCallId: '1',
      toolName: 'read',
      inputText: '{}',
      rawText: '{}',
    };
    expect(isToolOnlyTranscriptMessage(baseMeta({ text: '', rawEvents: [ev] }), [ev])).toBe(true);
  });

  test('本文または非ツールイベントを含む assistant は false にする', () => {
    const tool: RawEvent = {
      type: 'toolCall',
      toolCallId: '1',
      toolName: 'read',
      inputText: '{}',
      rawText: '{}',
    };
    const reasoning: RawEvent = { type: 'reasoning', text: 'thinking', rawText: 'thinking' };

    expect(isToolOnlyTranscriptMessage(baseMeta({ text: 'done', rawEvents: [tool] }), [tool])).toBe(
      false,
    );
    expect(
      isToolOnlyTranscriptMessage(baseMeta({ text: '', rawEvents: [tool, reasoning] }), [
        tool,
        reasoning,
      ]),
    ).toBe(false);
  });
});
