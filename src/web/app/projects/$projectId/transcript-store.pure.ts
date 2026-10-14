import type { ChatMessage } from '../../../../shared/acp.ts';
import type { AcpSseEvent } from '../../../../shared/acp.ts';

import { applySessionMessageEventToMessages } from '../../../lib/api/acp-sse-cache.pure.ts';

export type SessionTranscript = {
  readonly messageIds: readonly string[];
  readonly messagesById: Readonly<Record<string, ChatMessage>>;
};

export type TranscriptStoreState = {
  readonly sessions: Readonly<Record<string, SessionTranscript>>;
};

export const EMPTY_MESSAGE_IDS: readonly string[] = Object.freeze([]);
export const EMPTY_MESSAGES: readonly ChatMessage[] = Object.freeze([]);

export const emptySessionTranscript = (): SessionTranscript => ({
  messageIds: EMPTY_MESSAGE_IDS,
  messagesById: Object.freeze({}),
});

export const EMPTY_TRANSCRIPT_STORE: TranscriptStoreState = Object.freeze({
  sessions: Object.freeze({}),
});

export const sessionTranscriptFromMessages = (
  messages: readonly ChatMessage[],
): SessionTranscript => {
  if (messages.length === 0) {
    return emptySessionTranscript();
  }
  const messageIds = messages.map((message) => message.id);
  const messagesById: Record<string, ChatMessage> = {};
  for (const message of messages) {
    messagesById[message.id] = message;
  }
  return { messageIds, messagesById };
};

export const messagesFromSessionTranscript = (
  session: SessionTranscript,
): readonly ChatMessage[] => {
  if (session.messageIds.length === 0) {
    return EMPTY_MESSAGES;
  }
  const messages: ChatMessage[] = [];
  for (const id of session.messageIds) {
    const message = session.messagesById[id];
    if (message !== undefined) {
      messages.push(message);
    }
  }
  return messages;
};

type MessageEvent = Extract<AcpSseEvent, { type: 'message-add' | 'message-delta' }>;

/**
 * Apply an SSE message event while preserving stable `messageIds` and
 * unchanged per-id message references (MUI-style normalized updates).
 */
export const applyMessageEventToSessionTranscript = (
  session: SessionTranscript,
  event: MessageEvent,
): SessionTranscript => {
  const previousMessages = messagesFromSessionTranscript(session);
  const nextResponse = applySessionMessageEventToMessages(
    {
      messages: [...previousMessages],
      pageInfo: { hasMoreBefore: false, beforeCursor: null },
      meta: { totalMessageCount: previousMessages.length },
    },
    event,
  );
  const nextMessages = nextResponse.messages;

  if (
    nextMessages.length === previousMessages.length &&
    nextMessages.every((message, index) => message === previousMessages[index])
  ) {
    return session;
  }

  const idsUnchanged =
    nextMessages.length === previousMessages.length &&
    nextMessages.every((message, index) => message.id === previousMessages[index]?.id);

  const messagesById: Record<string, ChatMessage> = idsUnchanged ? { ...session.messagesById } : {};
  for (const message of nextMessages) {
    messagesById[message.id] = message;
  }

  return {
    messageIds: idsUnchanged ? session.messageIds : nextMessages.map((message) => message.id),
    messagesById,
  };
};

export const appendMessageToSessionTranscript = (
  session: SessionTranscript,
  message: ChatMessage,
): SessionTranscript => {
  if (session.messagesById[message.id] !== undefined) {
    return session;
  }
  return {
    messageIds: [...session.messageIds, message.id],
    messagesById: { ...session.messagesById, [message.id]: message },
  };
};

export const replaceSessionTranscriptMessages = (
  session: SessionTranscript,
  messages: readonly ChatMessage[],
): SessionTranscript => sessionTranscriptFromMessages(messages);

export const moveSessionTranscript = ({
  from,
  state,
  to,
}: {
  readonly from: string;
  readonly to: string;
  readonly state: TranscriptStoreState;
}): TranscriptStoreState => {
  if (from === to) {
    return state;
  }
  const source = state.sessions[from];
  if (source === undefined || source.messageIds.length === 0) {
    return state;
  }
  const target = state.sessions[to] ?? emptySessionTranscript();
  const merged = sessionTranscriptFromMessages([
    ...messagesFromSessionTranscript(target),
    ...messagesFromSessionTranscript(source),
  ]);
  const sessions = { ...state.sessions, [to]: merged };
  delete sessions[from];
  return { sessions };
};
