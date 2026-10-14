import { memo, type ReactNode } from 'react';

import type { ChatMessage } from '../../../../shared/acp.ts';

import { cn } from '../../../lib/utils.ts';
import { chatMessageClipboardText } from './chat-block-copy.pure.ts';
import { CopyBlockButton } from './copy-block-button.tsx';
import { shouldShowMessageCopyButton } from './message-copy-display.pure.ts';
import {
  filterDisplayableRawEvents,
  isToolOnlyTranscriptMessage,
  shouldDisplayTranscriptMessage,
} from './transcript-display.pure.ts';
import { useTranscriptMessage } from './transcript-store.ts';

const CONVERSATION_COLUMN_CLASS = 'w-full min-w-0 sm:w-[90%] md:w-[85%] max-w-3xl lg:max-w-4xl';

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export type ChatMessageRowProps = {
  readonly messageId: string;
  readonly nextMessageId: string | null;
  readonly previousMessageId: string | null;
  readonly renderBody: (message: ChatMessage) => ReactNode;
  readonly transcriptKey: string;
};

const toolCallIdFrom = (message: ChatMessage): string | null => {
  const event = message.rawEvents[0];
  if (event === undefined) {
    return null;
  }
  if (event.type === 'toolCall' || event.type === 'toolResult' || event.type === 'toolError') {
    return event.toolCallId;
  }
  return null;
};

const mergeToolCallWithNeighbor = (
  message: ChatMessage,
  neighbor: ChatMessage | null,
): ChatMessage => {
  const kind = message.kind ?? 'legacy_assistant_turn';
  const event = message.rawEvents[0];
  if (kind !== 'tool_call' || event?.type !== 'toolCall' || neighbor === null) {
    return message;
  }
  const neighborKind = neighbor.kind ?? 'legacy_assistant_turn';
  const neighborEvent = neighbor.rawEvents[0];
  const toolCallId = event.toolCallId;
  if (
    (neighborKind === 'tool_result' &&
      neighborEvent?.type === 'toolResult' &&
      neighborEvent.toolCallId === toolCallId) ||
    (neighborKind === 'tool_error' &&
      neighborEvent?.type === 'toolError' &&
      neighborEvent.toolCallId === toolCallId)
  ) {
    return {
      ...message,
      kind: 'legacy_assistant_turn',
      rawEvents: [event, neighborEvent],
      text: '',
    };
  }
  return message;
};

/**
 * Subscribes only to its own message id (plus neighbors for tool merge).
 * Streaming deltas re-render this row, not sibling rows or the composer.
 * `renderBody` is excluded from memo comparison on purpose.
 */
export const ChatMessageRow = memo(
  function ChatMessageRow({
    messageId,
    nextMessageId,
    previousMessageId,
    renderBody,
    transcriptKey,
  }: ChatMessageRowProps) {
    const message = useTranscriptMessage(transcriptKey, messageId);
    const previousMessage = useTranscriptMessage(transcriptKey, previousMessageId ?? '');
    const nextMessage = useTranscriptMessage(transcriptKey, nextMessageId ?? '');

    if (message === null) {
      return null;
    }

    // Matching tool_result/error rows are rendered via the preceding tool_call row.
    const kind = message.kind ?? 'legacy_assistant_turn';
    if (
      (kind === 'tool_result' || kind === 'tool_error') &&
      previousMessage !== null &&
      toolCallIdFrom(previousMessage) !== null &&
      toolCallIdFrom(previousMessage) === toolCallIdFrom(message)
    ) {
      return null;
    }

    const displayMessage = mergeToolCallWithNeighbor(message, nextMessage);

    const displayEvents = filterDisplayableRawEvents(displayMessage.rawEvents);
    if (!shouldDisplayTranscriptMessage(displayMessage, displayEvents)) {
      return null;
    }

    const isUser = displayMessage.role === 'user';
    const isToolOnly = isToolOnlyTranscriptMessage(displayMessage, displayEvents);
    const previousDisplayEvents =
      previousMessage === null ? [] : filterDisplayableRawEvents(previousMessage.rawEvents);
    const isAfterToolOnly =
      previousMessage !== null &&
      isToolOnlyTranscriptMessage(previousMessage, previousDisplayEvents);

    return (
      <div
        className={cn(
          // no content-visibility:auto — variable row heights jump while scrolling
          'group/message flex w-full',
          isUser ? 'justify-end' : 'justify-start',
          isToolOnly && isAfterToolOnly ? '-mt-3 md:-mt-4' : '',
        )}
        data-message-id={displayMessage.id}
      >
        <div
          className={cn('flex min-w-0 flex-col gap-1', CONVERSATION_COLUMN_CLASS, 'items-stretch')}
        >
          <div
            className={cn(
              'flex w-full items-center gap-1',
              isUser ? 'justify-end' : 'justify-start',
              isToolOnly ? 'sr-only' : '',
            )}
          >
            <time
              className="select-none text-xs tabular-nums text-muted-foreground"
              dateTime={displayMessage.createdAt}
            >
              {formatDateTime(displayMessage.createdAt)}
            </time>
            {shouldShowMessageCopyButton(displayMessage) ? (
              <CopyBlockButton
                className="size-6 text-muted-foreground/80 opacity-80 hover:opacity-100"
                text={chatMessageClipboardText(displayMessage)}
              />
            ) : null}
          </div>
          {isUser ? (
            <div className="app-user-message w-full rounded-lg border px-3 py-3 text-foreground shadow-sm">
              {renderBody(displayMessage)}
            </div>
          ) : (
            <div className="w-full min-w-0 text-card-foreground">{renderBody(displayMessage)}</div>
          )}
        </div>
      </div>
    );
  },
  (previous, next) =>
    previous.messageId === next.messageId &&
    previous.previousMessageId === next.previousMessageId &&
    previous.nextMessageId === next.nextMessageId &&
    previous.transcriptKey === next.transcriptKey,
);
