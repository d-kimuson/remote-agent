import { Loader2 } from 'lucide-react';
import { memo, useEffect, useRef, type ReactNode } from 'react';

import type { ChatMessage } from '../../../../shared/acp.ts';

import { cn } from '../../../lib/utils.ts';
import { ChatMessageRow } from './chat-message-row.tsx';
import {
  useTranscriptMessage,
  useTranscriptMessageIds,
  useTranscriptTurnBusy,
} from './transcript-store.ts';

const CONVERSATION_COLUMN_CLASS = 'w-full min-w-0 sm:w-[90%] md:w-[85%] max-w-3xl lg:max-w-4xl';

export type ChatTranscriptThreadProps = {
  readonly followTail: boolean;
  readonly renderMessageBody: (message: ChatMessage) => ReactNode;
  readonly shouldShowThinking: boolean;
  readonly thinkingLabel: string;
  readonly transcriptKey: string;
};

/**
 * Owns scroll-into-view for the live tail without forcing the id list to
 * re-render on every token.
 */
const ChatTranscriptScrollFollow = memo(function ChatTranscriptScrollFollow({
  followTail,
  shouldShowThinking,
  transcriptKey,
}: {
  readonly followTail: boolean;
  readonly shouldShowThinking: boolean;
  readonly transcriptKey: string;
}) {
  const messageIds = useTranscriptMessageIds(transcriptKey);
  const lastMessageId = messageIds[messageIds.length - 1] ?? null;
  const lastMessage = useTranscriptMessage(transcriptKey, lastMessageId ?? '');
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!followTail) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      scrollAnchorRef.current?.scrollIntoView({ block: 'end' });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    followTail,
    lastMessage?.text.length,
    lastMessage?.updatedAt,
    messageIds.length,
    shouldShowThinking,
  ]);

  return <div aria-hidden ref={scrollAnchorRef} />;
});

/**
 * Thread list that re-renders only when message *ids* change.
 * Per-message streaming stays inside ChatMessageRow.
 * New messages always mount live; followTail only controls auto-scroll.
 */
export const ChatTranscriptThread = memo(function ChatTranscriptThread({
  followTail,
  renderMessageBody,
  shouldShowThinking,
  thinkingLabel,
  transcriptKey,
}: ChatTranscriptThreadProps) {
  const messageIds = useTranscriptMessageIds(transcriptKey);
  const isTurnBusy = useTranscriptTurnBusy(transcriptKey);
  const showThinking = shouldShowThinking && isTurnBusy;

  return (
    <div className="[overflow-anchor:none]">
      {messageIds.map((messageId, index) => (
        <ChatMessageRow
          key={messageId}
          messageId={messageId}
          nextMessageId={messageIds[index + 1] ?? null}
          previousMessageId={index > 0 ? (messageIds[index - 1] ?? null) : null}
          renderBody={renderMessageBody}
          transcriptKey={transcriptKey}
        />
      ))}
      {showThinking ? (
        <div
          className={cn('flex w-full min-w-0 flex-col', CONVERSATION_COLUMN_CLASS, 'pl-0.5')}
          role="status"
        >
          <div className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border/60 bg-card/70 px-4 py-3 text-sm text-muted-foreground shadow-sm">
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
            <span>
              <span className="font-medium text-foreground">{thinkingLabel}</span>
              <span> が考えています…</span>
            </span>
          </div>
        </div>
      ) : null}
      <ChatTranscriptScrollFollow
        followTail={followTail}
        shouldShowThinking={showThinking}
        transcriptKey={transcriptKey}
      />
    </div>
  );
});
