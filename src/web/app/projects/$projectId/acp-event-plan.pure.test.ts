import { describe, expect, test } from "vitest";

import type { RawEvent } from "../../../../shared/acp.ts";
import { planRawEventsForRender } from "./acp-event-plan.pure.ts";

describe("planRawEventsForRender", () => {
  test("call → result 連続のとき1ブロック（emit は result 行＝最後）", () => {
    const events: RawEvent[] = [
      { type: "toolCall", toolCallId: "a", toolName: "read", inputText: "{}", rawText: "{}" },
      { type: "toolResult", toolCallId: "a", toolName: "read", outputText: "ok", rawText: "ok" },
    ];
    const plan = planRawEventsForRender(events);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({
      type: "tool",
      key: "tool-a",
      toolCallId: "a",
      call: events[0],
      result: events[1],
      error: null,
    });
  });

  test("call / reasoning / result の間に挟んでも1ブロックに集約（ツール行は最後）", () => {
    const events: RawEvent[] = [
      { type: "toolCall", toolCallId: "x", toolName: "x", inputText: "{}", rawText: "{}" },
      { type: "reasoning", text: "…", rawText: "…" },
      { type: "toolResult", toolCallId: "x", toolName: "x", outputText: "r", rawText: "r" },
    ];
    const plan = planRawEventsForRender(events);
    expect(plan.map((p) => p.type)).toEqual(["raw", "tool"]);
    expect(plan[1]).toEqual({
      type: "tool",
      key: "tool-x",
      toolCallId: "x",
      call: events[0],
      result: events[2],
      error: null,
    });
  });
});
