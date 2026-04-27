import type { ChatMessage, ChatMessageKind, RawEvent } from "../../../../shared/acp.ts";

export type { ChatMessage } from "../../../../shared/acp.ts";

export type TranscriptMap = Record<string, readonly ChatMessage[]>;

export const createChatMessage = (
  role: ChatMessage["role"],
  text: string,
  rawEvents: readonly RawEvent[] = [],
  options?: { readonly kind?: ChatMessageKind },
): ChatMessage => {
  const t = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    role,
    kind: options?.kind,
    text,
    rawEvents: [...rawEvents],
    createdAt: t,
    updatedAt: t,
  };
};
