import type { ChatMessage, ChatMessageKind } from '../../../../shared/acp.ts';

const STREAMING_PLAIN_TEXT_KINDS = new Set<ChatMessageKind>([
  'assistant_text',
  'legacy_assistant_turn',
  'tool_input',
]);

/**
 * While a turn is busy, the active (last) assistant text message must not pay
 * react-markdown on every token — plain text until the turn settles.
 */
export const shouldRenderMessageAsStreamingPlainText = ({
  isLastMessage,
  isTurnBusy,
  message,
}: {
  readonly isLastMessage: boolean;
  readonly isTurnBusy: boolean;
  readonly message: ChatMessage;
}): boolean => {
  if (!isTurnBusy || !isLastMessage || message.role !== 'assistant') {
    return false;
  }
  const kind: ChatMessageKind = message.kind ?? 'legacy_assistant_turn';
  return STREAMING_PLAIN_TEXT_KINDS.has(kind);
};
