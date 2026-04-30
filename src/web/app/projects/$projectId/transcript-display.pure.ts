import type { ChatMessage, ChatMessageKind, RawEvent } from '../../../../shared/acp';

import { planRawEventsForRender } from './acp-event-plan.pure.ts';

/**
 * 会話行として出さない（区切り・集計専用で本文に価値が薄い）メッセージ種別。
 * 直後の legacy ターンに集約された rawEvents 側では別途 `filterDisplayableRawEvents` する。
 */
const HIDDEN_MESSAGE_KINDS: ReadonlySet<ChatMessageKind> = new Set([
  'stream_start',
  'stream_finish',
  'step_start',
  'step_finish',
  'raw_meta',
]);

export const filterDisplayableRawEvents = (events: readonly RawEvent[]): readonly RawEvent[] => {
  return events.filter((ev) => {
    if (ev.type !== 'streamPart') {
      return true;
    }
    if (ev.partType === 'start' && ev.text.trim() === '') {
      return false;
    }
    if (ev.partType === 'start-step') {
      return false;
    }
    return true;
  });
};

export const shouldDisplayTranscriptMessage = (
  message: ChatMessage,
  displayableEvents: readonly RawEvent[],
): boolean => {
  if (message.role === 'user') {
    const attachmentCount =
      message.rawJson.type === 'user' ? (message.rawJson.attachments ?? []).length : 0;
    return message.text.trim().length > 0 || attachmentCount > 0;
  }
  const kind = message.kind ?? 'legacy_assistant_turn';
  if (HIDDEN_MESSAGE_KINDS.has(kind)) {
    return false;
  }
  if (message.text.trim().length > 0) {
    return true;
  }
  return displayableEvents.length > 0;
};

export const isToolOnlyTranscriptMessage = (
  message: ChatMessage,
  displayableEvents: readonly RawEvent[],
): boolean => {
  if (message.role !== 'assistant' || message.text.trim().length > 0) {
    return false;
  }
  if (displayableEvents.length === 0) {
    return false;
  }
  return planRawEventsForRender(displayableEvents).every((item) => item.type === 'tool');
};
