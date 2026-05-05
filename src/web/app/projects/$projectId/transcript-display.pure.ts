import { safeParse } from 'valibot';

import {
  sendPromptSelectionMetadataSchema,
  type ChatMessage,
  type ChatMessageKind,
  type RawEvent,
} from '../../../../shared/acp';
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

const resolveSelectionMetadataFromMessage = (message: ChatMessage) => {
  if (message.role !== 'user' || message.rawJson.type !== 'user') {
    return null;
  }
  if (message.rawJson.metadata === undefined) {
    return null;
  }
  const parsed = safeParse(sendPromptSelectionMetadataSchema, message.rawJson.metadata);
  return parsed.success ? parsed.output : null;
};

export const formatUserMessageSelectionMetadata = (message: ChatMessage): string | null => {
  const metadata = resolveSelectionMetadataFromMessage(message);
  if (metadata === null || metadata.source !== 'send-prompt') {
    return null;
  }
  const preset = metadata.presetId?.trim();
  const model = metadata.modelName?.trim() ?? metadata.modelId?.trim();
  const mode = metadata.modeName?.trim() ?? metadata.modeId?.trim();
  const chunks: string[] = [preset, model, mode].filter((value): value is string => {
    return value !== undefined && value !== null && value.length > 0;
  });
  return chunks.length > 0 ? chunks.join(' / ') : null;
};
