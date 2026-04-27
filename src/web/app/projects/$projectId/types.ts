import type { RawEvent } from "../../../../shared/acp.ts";

export type ChatMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly rawEvents: readonly RawEvent[];
};

export type TranscriptMap = Record<string, readonly ChatMessage[]>;

export const createChatMessage = (
  role: ChatMessage["role"],
  text: string,
  rawEvents: readonly RawEvent[] = [],
): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  text,
  rawEvents,
});
