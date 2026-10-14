import { memo, type FC } from 'react';

import { ChatMarkdown } from '../../../components/chat-markdown.tsx';

export type ChatMessageContentProps = {
  readonly className?: string;
  readonly isStreaming: boolean;
  readonly text: string;
};

/**
 * Dual-phase body text: plain during live streaming, markdown once settled.
 */
export const ChatMessageContent: FC<ChatMessageContentProps> = memo(function ChatMessageContent({
  className,
  isStreaming,
  text,
}) {
  if (text.length === 0) {
    return null;
  }
  if (isStreaming) {
    return (
      <div className={className ?? 'whitespace-pre-wrap break-words text-sm leading-relaxed'}>
        {text}
      </div>
    );
  }
  return <ChatMarkdown className={className}>{text}</ChatMarkdown>;
});
