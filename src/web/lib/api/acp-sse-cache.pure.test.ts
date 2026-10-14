import { describe, expect, test } from 'vitest';

import type {
  AcpPermissionRequest,
  AcpSseEvent,
  ChatMessage,
  SessionMessagesResponse,
} from '../../../shared/acp.ts';

import { applySessionMessageEventToMessages, newPermissionRequests } from './acp-sse-cache.pure.ts';

const baseTextDelta = {
  type: 'message-delta',
  sessionId: 'session-1',
  sequence: 2,
  deltaIndex: 2,
  messageId: 'message-1',
  streamPartId: 'turn-1::text-1',
  kind: 'assistant_text',
  contentDelta: 'lo',
  createdAt: '2026-04-28T00:00:00.000Z',
  updatedAt: '2026-04-28T00:00:01.000Z',
} satisfies AcpSseEvent;

const baseMessage = {
  id: 'message-1',
  role: 'assistant',
  kind: 'assistant_text',
  rawJson: {
    schemaVersion: 1,
    type: 'assistant_text',
    role: 'assistant',
    streamPartId: 'turn-1::text-1',
    providerStreamId: 'turn-1::text-1',
    text: 'hel',
    deltaCount: 1,
    createdAt: '2026-04-28T00:00:00.000Z',
  },
  textForSearch: 'hel',
  text: 'hel',
  rawEvents: [],
  createdAt: '2026-04-28T00:00:00.000Z',
  updatedAt: '2026-04-28T00:00:00.500Z',
  streamPartId: 'turn-1::text-1',
} satisfies ChatMessage;

const baseReasoningDelta = {
  type: 'message-delta',
  sessionId: 'session-1',
  sequence: 3,
  deltaIndex: 1,
  messageId: 'reasoning-1',
  streamPartId: 'turn-1::reasoning-1',
  kind: 'reasoning',
  contentDelta: 'thinking',
  createdAt: '2026-04-28T00:00:02.000Z',
  updatedAt: '2026-04-28T00:00:03.000Z',
} satisfies AcpSseEvent;

const userMessage = {
  id: 'user-1',
  role: 'user',
  kind: 'user',
  rawJson: {
    schemaVersion: 1,
    type: 'user',
    role: 'user',
    text: 'prompt',
    attachments: [],
    createdAt: '2026-04-28T00:00:00.000Z',
  },
  textForSearch: 'prompt',
  text: 'prompt',
  rawEvents: [],
  createdAt: '2026-04-28T00:00:00.000Z',
  updatedAt: '2026-04-28T00:00:00.000Z',
  streamPartId: null,
} satisfies ChatMessage;

describe('applySessionMessageEventToMessages', () => {
  test('appends a delta to the matching assistant text', () => {
    const current = {
      messages: [userMessage, baseMessage],
      pageInfo: { hasMoreBefore: false, beforeCursor: null },
      meta: { totalMessageCount: 2 },
    } satisfies SessionMessagesResponse;

    expect(applySessionMessageEventToMessages(current, baseTextDelta)).toEqual({
      messages: [
        userMessage,
        {
          ...baseMessage,
          rawJson: { ...baseMessage.rawJson, text: 'hello', deltaCount: 2 },
          textForSearch: 'hello',
          text: 'hello',
          updatedAt: '2026-04-28T00:00:01.000Z',
        },
      ],
      pageInfo: current.pageInfo,
      meta: current.meta,
    });
  });

  test('discards duplicate or older deltas by per-message deltaIndex', () => {
    const current = {
      messages: [
        {
          ...baseMessage,
          rawJson: { ...baseMessage.rawJson, text: 'hello', deltaCount: 2 },
          text: 'hello',
          textForSearch: 'hello',
        },
      ],
      pageInfo: { hasMoreBefore: false, beforeCursor: null },
      meta: { totalMessageCount: 1 },
    } satisfies SessionMessagesResponse;

    expect(applySessionMessageEventToMessages(current, baseTextDelta)).toBe(current);
  });

  test('appends a text message when the start row was not fetched before the delta patch', () => {
    const current = {
      messages: [userMessage],
      pageInfo: { hasMoreBefore: false, beforeCursor: null },
      meta: { totalMessageCount: 1 },
    } satisfies SessionMessagesResponse;

    expect(applySessionMessageEventToMessages(current, baseTextDelta)).toEqual({
      messages: [
        userMessage,
        {
          id: 'message-1',
          role: 'assistant',
          kind: 'assistant_text',
          rawJson: {
            schemaVersion: 1,
            type: 'assistant_text',
            role: 'assistant',
            streamPartId: 'turn-1::text-1',
            providerStreamId: 'turn-1::text-1',
            text: 'lo',
            deltaCount: 2,
            createdAt: '2026-04-28T00:00:00.000Z',
          },
          textForSearch: 'lo',
          text: 'lo',
          rawEvents: [],
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:00:01.000Z',
          streamPartId: 'turn-1::text-1',
          metadataJson: undefined,
        },
      ],
      pageInfo: current.pageInfo,
      meta: { totalMessageCount: 2 },
    });
  });

  test('creates a text message when the cache has not been loaded yet', () => {
    expect(applySessionMessageEventToMessages(undefined, baseTextDelta)).toEqual({
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          kind: 'assistant_text',
          rawJson: {
            schemaVersion: 1,
            type: 'assistant_text',
            role: 'assistant',
            streamPartId: 'turn-1::text-1',
            providerStreamId: 'turn-1::text-1',
            text: 'lo',
            deltaCount: 2,
            createdAt: '2026-04-28T00:00:00.000Z',
          },
          textForSearch: 'lo',
          text: 'lo',
          rawEvents: [],
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:00:01.000Z',
          streamPartId: 'turn-1::text-1',
          metadataJson: undefined,
        },
      ],
      pageInfo: { hasMoreBefore: false, beforeCursor: null },
      meta: { totalMessageCount: 1 },
    });
  });

  test('creates a reasoning message when a reasoning delta arrives before cache hydration', () => {
    expect(applySessionMessageEventToMessages(undefined, baseReasoningDelta)).toEqual({
      messages: [
        {
          id: 'reasoning-1',
          role: 'assistant',
          kind: 'reasoning',
          rawJson: {
            schemaVersion: 1,
            type: 'reasoning',
            role: 'assistant',
            streamPartId: 'turn-1::reasoning-1',
            providerStreamId: 'turn-1::reasoning-1',
            text: 'thinking',
            deltaCount: 1,
            createdAt: '2026-04-28T00:00:02.000Z',
          },
          textForSearch: 'thinking',
          text: 'thinking',
          rawEvents: [],
          createdAt: '2026-04-28T00:00:02.000Z',
          updatedAt: '2026-04-28T00:00:03.000Z',
          streamPartId: 'turn-1::reasoning-1',
          metadataJson: undefined,
        },
      ],
      pageInfo: { hasMoreBefore: false, beforeCursor: null },
      meta: { totalMessageCount: 1 },
    });
  });

  test('upserts message-add events by id', () => {
    const event = {
      type: 'message-add',
      sessionId: 'session-1',
      sequence: 1,
      message: userMessage,
    } satisfies AcpSseEvent;

    expect(applySessionMessageEventToMessages(undefined, event)).toEqual({
      messages: [userMessage],
      pageInfo: { hasMoreBefore: false, beforeCursor: null },
      meta: { totalMessageCount: 1 },
    });

    const current = {
      messages: [userMessage],
      pageInfo: { hasMoreBefore: false, beforeCursor: null },
      meta: { totalMessageCount: 1 },
    } satisfies SessionMessagesResponse;

    expect(applySessionMessageEventToMessages(current, event)).toEqual(current);
  });
});

describe('newPermissionRequests', () => {
  const request = {
    id: 'request-1',
    sessionId: 'session-1',
    toolCallId: 'tool-call-1',
    title: 'Approve command',
    kind: 'tool_call',
    rawInputText: '{"foo":"bar"}',
    options: [],
    createdAt: '2026-04-29T00:00:00.000Z',
  } satisfies AcpPermissionRequest;

  test('returns requests whose ids were not known', () => {
    expect(newPermissionRequests({ current: [request], knownRequestIds: new Set() })).toEqual([
      request,
    ]);
  });

  test('filters requests whose ids were already known', () => {
    expect(
      newPermissionRequests({ current: [request], knownRequestIds: new Set(['request-1']) }),
    ).toEqual([]);
  });
});
