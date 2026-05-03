import { describe, expect, test } from 'vitest';

import type {
  AcpPermissionRequest,
  AcpSseEvent,
  ChatMessage,
  SessionMessagesResponse,
} from '../../../shared/acp.ts';

import { applySessionStreamDeltaToMessages, newPermissionRequests } from './acp-sse-cache.pure.ts';

const baseTextDelta = {
  type: 'session_text_delta',
  sessionId: 'session-1',
  messageId: 'message-1',
  streamPartId: 'turn-1::text-1',
  delta: 'lo',
  text: 'hello',
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
  type: 'session_reasoning_delta',
  sessionId: 'session-1',
  messageId: 'reasoning-1',
  streamPartId: 'turn-1::reasoning-1',
  delta: 'inking',
  text: 'thinking',
  createdAt: '2026-04-28T00:00:02.000Z',
  updatedAt: '2026-04-28T00:00:03.000Z',
} satisfies AcpSseEvent;

describe('applySessionStreamDeltaToMessages', () => {
  test('replaces the matching assistant text with the server snapshot', () => {
    const current = {
      messages: [
        {
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
        },
        baseMessage,
      ],
      pageInfo: { hasMoreBefore: false, beforeCursor: null },
      meta: { totalMessageCount: 2 },
    } satisfies SessionMessagesResponse;

    expect(applySessionStreamDeltaToMessages(current, baseTextDelta)).toEqual({
      messages: [
        current.messages[0],
        {
          ...baseMessage,
          rawJson: { ...baseMessage.rawJson, text: 'hello' },
          textForSearch: 'hello',
          text: 'hello',
          updatedAt: '2026-04-28T00:00:01.000Z',
        },
      ],
      pageInfo: current.pageInfo,
      meta: current.meta,
    });
  });

  test('appends a text message when the start row was fetched before the delta patch', () => {
    const current = {
      messages: [
        {
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
        },
      ],
      pageInfo: { hasMoreBefore: false, beforeCursor: null },
      meta: { totalMessageCount: 1 },
    } satisfies SessionMessagesResponse;

    expect(applySessionStreamDeltaToMessages(current, baseTextDelta)).toEqual({
      messages: [
        current.messages[0],
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
            text: 'hello',
            createdAt: '2026-04-28T00:00:00.000Z',
          },
          textForSearch: 'hello',
          text: 'hello',
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
    expect(applySessionStreamDeltaToMessages(undefined, baseTextDelta)).toEqual({
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
            text: 'hello',
            createdAt: '2026-04-28T00:00:00.000Z',
          },
          textForSearch: 'hello',
          text: 'hello',
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
    expect(applySessionStreamDeltaToMessages(undefined, baseReasoningDelta)).toEqual({
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
});

describe('newPermissionRequests', () => {
  const request = {
    id: 'request-1',
    sessionId: 'session-1',
    toolCallId: 'tool-1',
    title: 'Allow shell command',
    kind: 'tool',
    rawInputText: null,
    options: [{ id: 'allow', kind: 'allow_once', name: 'Allow' }],
    createdAt: '2026-04-30T00:00:00.000Z',
  } satisfies AcpPermissionRequest;

  test('returns only unseen permission requests', () => {
    expect(
      newPermissionRequests({
        current: [
          request,
          {
            ...request,
            id: 'request-2',
          },
        ],
        knownRequestIds: new Set(['request-1']),
      }).map((entry) => entry.id),
    ).toEqual(['request-2']);
  });
});
