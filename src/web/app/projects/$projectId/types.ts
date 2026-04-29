import type {
  ChatMessage,
  ChatMessageKind,
  PersistedMessageRaw,
  RawEvent,
} from '../../../../shared/acp.ts';

export type { ChatMessage } from '../../../../shared/acp.ts';

export type TranscriptMap = Record<string, readonly ChatMessage[]>;

export const createChatMessage = (
  role: ChatMessage['role'],
  text: string,
  rawEvents: readonly RawEvent[] = [],
  options?: { readonly kind?: ChatMessageKind },
): ChatMessage => {
  const t = new Date().toISOString();
  const resolvedKind = options?.kind ?? (role === 'user' ? 'user' : 'legacy_assistant_turn');
  const rawJson: PersistedMessageRaw =
    role === 'user'
      ? { schemaVersion: 1, type: 'user', role: 'user', text, attachments: [], createdAt: t }
      : resolvedKind === 'legacy_assistant_turn'
        ? {
            schemaVersion: 1,
            type: 'legacy_assistant_turn',
            role: 'assistant',
            text,
            rawEvents: [...rawEvents],
            createdAt: t,
          }
        : {
            schemaVersion: 1,
            type: 'raw_meta',
            role: 'assistant',
            text,
            part: rawEvents,
            createdAt: t,
          };
  return {
    id: crypto.randomUUID(),
    role,
    kind: resolvedKind,
    rawJson,
    textForSearch: text,
    text,
    rawEvents: [...rawEvents],
    createdAt: t,
    updatedAt: t,
  };
};
