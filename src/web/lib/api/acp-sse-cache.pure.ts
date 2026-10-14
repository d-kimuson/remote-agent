import type {
  AcpPermissionRequest,
  AcpSseEvent,
  ChatMessage,
  SessionMessagesResponse,
} from '../../../shared/acp.ts';

type MessageAddEvent = Extract<AcpSseEvent, { type: 'message-add' }>;
type MessageDeltaEvent = Extract<AcpSseEvent, { type: 'message-delta' }>;
type MessageEvent = MessageAddEvent | MessageDeltaEvent;

const messageMatchesDelta = (message: ChatMessage, event: MessageDeltaEvent): boolean =>
  message.id === event.messageId || message.streamPartId === event.streamPartId;

const deltaCountFromMessage = (message: ChatMessage): number =>
  message.rawJson.type === 'assistant_text' ||
  message.rawJson.type === 'reasoning' ||
  message.rawJson.type === 'tool_input'
    ? (message.rawJson.deltaCount ?? 0)
    : 0;

const messageFromDelta = (event: MessageDeltaEvent): ChatMessage => ({
  id: event.messageId,
  role: 'assistant',
  kind: event.kind,
  rawJson: {
    schemaVersion: 1,
    type: event.kind,
    role: 'assistant',
    streamPartId: event.streamPartId,
    providerStreamId: event.streamPartId,
    text: event.contentDelta,
    deltaCount: event.deltaIndex,
    createdAt: event.createdAt,
  },
  textForSearch: event.contentDelta,
  text: event.contentDelta,
  rawEvents: [],
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
  streamPartId: event.streamPartId,
  metadataJson: event.metadataJson ?? undefined,
});

const mergeDeltaMessage = (message: ChatMessage, event: MessageDeltaEvent): ChatMessage => {
  if (event.deltaIndex <= deltaCountFromMessage(message)) {
    return message;
  }

  const text = `${message.text}${event.contentDelta}`;
  return {
    ...message,
    kind: message.kind ?? event.kind,
    rawJson:
      message.rawJson.type === 'assistant_text' || message.rawJson.type === 'reasoning'
        ? { ...message.rawJson, text, deltaCount: event.deltaIndex }
        : messageFromDelta(event).rawJson,
    textForSearch: text,
    text,
    updatedAt: event.updatedAt,
    streamPartId: message.streamPartId ?? event.streamPartId,
    metadataJson: event.metadataJson ?? message.metadataJson,
  };
};

const mergeAddMessage = (current: ChatMessage, incoming: ChatMessage): ChatMessage => {
  const currentDeltaCount = deltaCountFromMessage(current);
  const incomingDeltaCount = deltaCountFromMessage(incoming);
  if (currentDeltaCount > incomingDeltaCount) {
    return current;
  }
  return incoming;
};

const emptyMessagesResponse = (message: ChatMessage): SessionMessagesResponse => ({
  messages: [message],
  pageInfo: { hasMoreBefore: false, beforeCursor: null },
  meta: { totalMessageCount: 1 },
});

const applyMessageAddToMessages = (
  current: SessionMessagesResponse | undefined,
  event: MessageAddEvent,
): SessionMessagesResponse => {
  if (current === undefined) {
    return emptyMessagesResponse(event.message);
  }

  const matched = current.messages.some((message) => message.id === event.message.id);
  if (!matched) {
    return {
      ...current,
      messages: [...current.messages, event.message],
      meta: {
        ...current.meta,
        totalMessageCount: current.meta.totalMessageCount + 1,
      },
    };
  }

  const messages = current.messages.map((message) =>
    message.id === event.message.id ? mergeAddMessage(message, event.message) : message,
  );
  return messages.every((message, index) => message === current.messages[index])
    ? current
    : { ...current, messages };
};

const applyMessageDeltaToMessages = (
  current: SessionMessagesResponse | undefined,
  event: MessageDeltaEvent,
): SessionMessagesResponse => {
  if (current === undefined) {
    return emptyMessagesResponse(messageFromDelta(event));
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

  const messages = current.messages.map((message) =>
    messageMatchesDelta(message, event) ? mergeDeltaMessage(message, event) : message,
  );
  return messages.every((message, index) => message === current.messages[index])
    ? current
    : { ...current, messages };
};

export const applySessionMessageEventToMessages = (
  current: SessionMessagesResponse | undefined,
  event: MessageEvent,
): SessionMessagesResponse =>
  event.type === 'message-add'
    ? applyMessageAddToMessages(current, event)
    : applyMessageDeltaToMessages(current, event);

export const newPermissionRequests = ({
  current,
  knownRequestIds,
}: {
  readonly current: readonly AcpPermissionRequest[];
  readonly knownRequestIds: ReadonlySet<string>;
}): readonly AcpPermissionRequest[] =>
  current.filter((request) => !knownRequestIds.has(request.id));
