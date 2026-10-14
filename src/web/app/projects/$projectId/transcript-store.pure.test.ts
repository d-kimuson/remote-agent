import { describe, expect, test } from 'vitest';

import type { ChatMessage } from '../../../../shared/acp.ts';

import {
  appendMessageToSessionTranscript,
  applyMessageEventToSessionTranscript,
  emptySessionTranscript,
  messagesFromSessionTranscript,
  sessionTranscriptFromMessages,
} from './transcript-store.pure.ts';

const message = (id: string, text: string): ChatMessage => ({
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

describe('sessionTranscriptFromMessages', () => {
  test('normalizes ids and byId', () => {
    const session = sessionTranscriptFromMessages([message('a', 'one'), message('b', 'two')]);
    expect(session.messageIds).toEqual(['a', 'b']);
    expect(session.messagesById['a']?.text).toBe('one');
  });
});

describe('applyMessageEventToSessionTranscript', () => {
  test('keeps messageIds reference on delta to existing message', () => {
    const initial = sessionTranscriptFromMessages([message('a', 'Hello'), message('b', 'Other')]);
    const next = applyMessageEventToSessionTranscript(initial, {
      type: 'message-delta',
      sessionId: 's',
      sequence: 1,
      messageId: 'a',
      streamPartId: 'a',
      kind: 'assistant_text',
      contentDelta: ' world',
      deltaIndex: 1,
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    });
    expect(next.messageIds).toBe(initial.messageIds);
    expect(next.messagesById['a']).not.toBe(initial.messagesById['a']);
    expect(next.messagesById['a']?.text).toBe('Hello world');
    expect(next.messagesById['b']).toBe(initial.messagesById['b']);
  });
});

describe('appendMessageToSessionTranscript', () => {
  test('appends a new message id', () => {
    const initial = emptySessionTranscript();
    const next = appendMessageToSessionTranscript(initial, message('a', 'hi'));
    expect(messagesFromSessionTranscript(next).map((entry) => entry.id)).toEqual(['a']);
  });
});
