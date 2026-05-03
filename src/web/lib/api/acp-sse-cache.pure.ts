import type {
  AcpPermissionRequest,
  AcpSseEvent,
  ChatMessage,
  SessionMessagesResponse,
} from '../../../shared/acp.ts';

type SessionStreamDeltaEvent = Extract<
  AcpSseEvent,
  { type: 'session_text_delta' | 'session_reasoning_delta' }
>;

const messageKindFromDelta = (
  event: SessionStreamDeltaEvent,
): Extract<ChatMessage['kind'], 'assistant_text' | 'reasoning'> =>
  event.type === 'session_text_delta' ? 'assistant_text' : 'reasoning';

const messageMatchesDelta = (message: ChatMessage, event: SessionStreamDeltaEvent): boolean =>
  message.id === event.messageId || message.streamPartId === event.streamPartId;

const messageFromDelta = (event: SessionStreamDeltaEvent): ChatMessage => ({
  id: event.messageId,
  role: 'assistant',
  kind: messageKindFromDelta(event),
  rawJson: {
    schemaVersion: 1,
    type: messageKindFromDelta(event),
    role: 'assistant',
    streamPartId: event.streamPartId,
    providerStreamId: event.streamPartId,
    text: event.text,
    createdAt: event.createdAt,
  },
  textForSearch: event.text,
  text: event.text,
  rawEvents: [],
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
  streamPartId: event.streamPartId,
  metadataJson: event.metadataJson ?? undefined,
});

const mergeTextDeltaMessage = (
  message: ChatMessage,
  event: SessionStreamDeltaEvent,
): ChatMessage => ({
  ...message,
  kind: message.kind ?? messageKindFromDelta(event),
  rawJson:
    message.rawJson.type === 'assistant_text' || message.rawJson.type === 'reasoning'
      ? { ...message.rawJson, text: event.text }
      : messageFromDelta(event).rawJson,
  textForSearch: event.text,
  text: event.text,
  updatedAt: event.updatedAt,
  streamPartId: message.streamPartId ?? event.streamPartId,
  metadataJson: event.metadataJson ?? message.metadataJson,
});

export const applySessionStreamDeltaToMessages = (
  current: SessionMessagesResponse | undefined,
  event: SessionStreamDeltaEvent,
): SessionMessagesResponse => {
  if (current === undefined) {
    return {
      messages: [messageFromDelta(event)],
      pageInfo: { hasMoreBefore: false, beforeCursor: null },
      meta: { totalMessageCount: 1 },
    };
  }

  const matched = current.messages.some((message) => messageMatchesDelta(message, event));
  if (!matched) {
    return {
      ...current,
      messages: [...current.messages, messageFromDelta(event)],
      meta: {
        ...current.meta,
        totalMessageCount: current.meta.totalMessageCount + 1,
      },
    };
  }

  return {
    ...current,
    messages: current.messages.map((message) =>
      messageMatchesDelta(message, event) ? mergeTextDeltaMessage(message, event) : message,
    ),
  };
};

export const newPermissionRequests = ({
  current,
  knownRequestIds,
}: {
  readonly current: readonly AcpPermissionRequest[];
  readonly knownRequestIds: ReadonlySet<string>;
}): readonly AcpPermissionRequest[] =>
  current.filter((request) => !knownRequestIds.has(request.id));
