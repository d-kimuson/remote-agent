import type { ChatMessage, RawEvent } from "../../../../shared/acp.ts";

export type { ChatMessage } from "../../../../shared/acp.ts";

export type TranscriptMap = Record<string, readonly ChatMessage[]>;

export const createChatMessage = (
  role: ChatMessage["role"],
  text: string,
  rawEvents: readonly RawEvent[] = [],
): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  text,
  rawEvents: [...rawEvents],
  createdAt: new Date().toISOString(),
});
