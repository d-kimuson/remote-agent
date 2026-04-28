import type { ChatMessage, RawEvent } from '../../../../shared/acp.ts';

import { planRawEventsForRender } from './acp-event-plan.pure.ts';
import { chatMessageClipboardText } from './chat-block-copy.pure.ts';
import { filterDisplayableRawEvents } from './transcript-display.pure.ts';

const isToolOnlyEvents = (events: readonly RawEvent[]): boolean => {
  const displayable = filterDisplayableRawEvents(events);
  if (displayable.length === 0) {
    return false;
  }
  return planRawEventsForRender(displayable).every((item) => item.type === 'tool');
};

export const shouldShowMessageCopyButton = (message: ChatMessage): boolean => {
  const kind = message.kind ?? 'legacy_assistant_turn';
  if (kind === 'tool_call' || kind === 'tool_result' || kind === 'tool_error') {
    return false;
  }
  if (message.text.trim().length === 0 && isToolOnlyEvents(message.rawEvents)) {
    return false;
  }
  return chatMessageClipboardText(message).trim().length > 0;
};
