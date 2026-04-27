import type { ChatMessage, RawEvent } from "../../../../shared/acp.ts";

const firstEvent = (m: ChatMessage): RawEvent | null => m.rawEvents[0] ?? null;

/**
 * DB に tool_call / tool_result が別行で入るため、同じ toolCallId のペア（検索範囲内）を1メッセージの rawEvents に潰し込む。
 * 重複行は二重表示を防ぐため skip index で飛ばす（後続 result を consumed に入れる）。
 */
export const mergeToolCallResultMessages = (
  messages: readonly ChatMessage[],
): readonly ChatMessage[] => {
  if (messages.length === 0) {
    return messages;
  }

  const consumed = new Set<number>();
  const out: ChatMessage[] = [];

  for (let i = 0; i < messages.length; i += 1) {
    if (consumed.has(i)) {
      continue;
    }

    const m = messages[i];
    if (m === undefined) {
      continue;
    }
    const r0 = firstEvent(m);
    const kind = m.kind ?? "legacy_assistant_turn";

    if (r0 === null) {
      out.push(m);
      continue;
    }

    if (kind === "tool_call" && r0.type === "toolCall") {
      const id = r0.toolCallId;
      const acc: RawEvent[] = [r0];
      let found = -1;
      for (let j = i + 1; j < messages.length; j += 1) {
        if (consumed.has(j)) {
          continue;
        }
        const m2 = messages[j];
        if (m2 === undefined) {
          break;
        }
        if (m2.role === "user") {
          break;
        }
        const s = firstEvent(m2);
        if (s === null) {
          continue;
        }
        const k2 = m2.kind ?? "legacy_assistant_turn";
        if (k2 === "tool_result" && s.type === "toolResult" && s.toolCallId === id) {
          acc.push(s);
          found = j;
          break;
        }
        if (k2 === "tool_error" && s.type === "toolError" && s.toolCallId === id) {
          acc.push(s);
          found = j;
          break;
        }
        if (k2 === "tool_call") {
          break;
        }
      }
      if (found >= 0) {
        consumed.add(found);
      }
      out.push({ ...m, kind: "legacy_assistant_turn", rawEvents: acc, text: "" });
    } else {
      out.push(m);
    }
  }

  return out;
};
