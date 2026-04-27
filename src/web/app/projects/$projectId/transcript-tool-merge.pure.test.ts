import { describe, expect, test } from "vitest";

import type { ChatMessage } from "../../../../shared/acp.ts";
import { mergeToolCallResultMessages } from "./transcript-tool-merge.pure.ts";

const msg = (overrides: Partial<ChatMessage> & { id: string }): ChatMessage => ({
  role: "assistant",
  text: "",
  rawEvents: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  ...overrides,
});

describe("mergeToolCallResultMessages", () => {
  test("同じ id の tool_call の直後の tool_result を1行にまとめ、result 行を消費", () => {
    const call: ChatMessage = msg({
      id: "a",
      kind: "tool_call",
      text: "in",
      rawEvents: [
        { type: "toolCall", toolCallId: "x", toolName: "t", inputText: "{}", rawText: "{}" },
      ],
    });
    const res: ChatMessage = msg({
      id: "b",
      kind: "tool_result",
      text: "out",
      rawEvents: [
        { type: "toolResult", toolCallId: "x", toolName: "t", outputText: "ok", rawText: "ok" },
      ],
    });
    const merged = mergeToolCallResultMessages([call, res]);
    expect(merged).toHaveLength(1);
    const one = merged.at(0);
    expect(one?.rawEvents).toHaveLength(2);
    expect(one?.kind).toBe("legacy_assistant_turn");
  });

  test("中に reasoning が混ざっても前方検索でマージ", () => {
    const call = msg({
      id: "a",
      kind: "tool_call",
      rawEvents: [
        { type: "toolCall", toolCallId: "x", toolName: "t", inputText: "{}", rawText: "{}" },
      ],
    });
    const mid = msg({
      id: "m",
      kind: "reasoning",
      text: "think",
      rawEvents: [],
    });
    const res = msg({
      id: "b",
      kind: "tool_result",
      rawEvents: [
        { type: "toolResult", toolCallId: "x", toolName: "t", outputText: "o", rawText: "o" },
      ],
    });
    const merged = mergeToolCallResultMessages([call, mid, res]);
    expect(merged).toHaveLength(2);
    expect(merged.at(0)?.rawEvents).toHaveLength(2);
    expect(merged.at(1)?.id).toBe("m");
  });
});
