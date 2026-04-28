import { describe, expect, test } from "vitest";

import type { AcpSseEvent, ChatMessage, SessionMessagesResponse } from "../../../shared/acp.ts";
import { applySessionStreamDeltaToMessages } from "./acp-sse-cache.pure.ts";

const baseTextDelta = {
  type: "session_text_delta",
  sessionId: "session-1",
  messageId: "message-1",
  streamPartId: "turn-1::text-1",
  delta: "lo",
  text: "hello",
  createdAt: "2026-04-28T00:00:00.000Z",
  updatedAt: "2026-04-28T00:00:01.000Z",
} satisfies AcpSseEvent;

const baseMessage = {
  id: "message-1",
  role: "assistant",
  kind: "assistant_text",
  text: "hel",
  rawEvents: [],
  createdAt: "2026-04-28T00:00:00.000Z",
  updatedAt: "2026-04-28T00:00:00.500Z",
  streamPartId: "turn-1::text-1",
} satisfies ChatMessage;

const baseReasoningDelta = {
  type: "session_reasoning_delta",
  sessionId: "session-1",
  messageId: "reasoning-1",
  streamPartId: "turn-1::reasoning-1",
  delta: "inking",
  text: "thinking",
  createdAt: "2026-04-28T00:00:02.000Z",
  updatedAt: "2026-04-28T00:00:03.000Z",
} satisfies AcpSseEvent;

describe("applySessionStreamDeltaToMessages", () => {
  test("replaces the matching assistant text with the server snapshot", () => {
    const current = {
      messages: [
        {
          id: "user-1",
          role: "user",
          kind: "user",
          text: "prompt",
          rawEvents: [],
          createdAt: "2026-04-28T00:00:00.000Z",
          updatedAt: "2026-04-28T00:00:00.000Z",
          streamPartId: null,
        },
        baseMessage,
      ],
    } satisfies SessionMessagesResponse;

    expect(applySessionStreamDeltaToMessages(current, baseTextDelta)).toEqual({
      messages: [
        current.messages[0],
        {
          ...baseMessage,
          text: "hello",
          updatedAt: "2026-04-28T00:00:01.000Z",
        },
      ],
    });
  });

  test("appends a text message when the start row was fetched before the delta patch", () => {
    const current = {
      messages: [
        {
          id: "user-1",
          role: "user",
          kind: "user",
          text: "prompt",
          rawEvents: [],
          createdAt: "2026-04-28T00:00:00.000Z",
          updatedAt: "2026-04-28T00:00:00.000Z",
          streamPartId: null,
        },
      ],
    } satisfies SessionMessagesResponse;

    expect(applySessionStreamDeltaToMessages(current, baseTextDelta)).toEqual({
      messages: [
        current.messages[0],
        {
          id: "message-1",
          role: "assistant",
          kind: "assistant_text",
          text: "hello",
          rawEvents: [],
          createdAt: "2026-04-28T00:00:00.000Z",
          updatedAt: "2026-04-28T00:00:01.000Z",
          streamPartId: "turn-1::text-1",
          metadataJson: undefined,
        },
      ],
    });
  });

  test("creates a text message when the cache has not been loaded yet", () => {
    expect(applySessionStreamDeltaToMessages(undefined, baseTextDelta)).toEqual({
      messages: [
        {
          id: "message-1",
          role: "assistant",
          kind: "assistant_text",
          text: "hello",
          rawEvents: [],
          createdAt: "2026-04-28T00:00:00.000Z",
          updatedAt: "2026-04-28T00:00:01.000Z",
          streamPartId: "turn-1::text-1",
          metadataJson: undefined,
        },
      ],
    });
  });

  test("creates a reasoning message when a reasoning delta arrives before cache hydration", () => {
    expect(applySessionStreamDeltaToMessages(undefined, baseReasoningDelta)).toEqual({
      messages: [
        {
          id: "reasoning-1",
          role: "assistant",
          kind: "reasoning",
          text: "thinking",
          rawEvents: [],
          createdAt: "2026-04-28T00:00:02.000Z",
          updatedAt: "2026-04-28T00:00:03.000Z",
          streamPartId: "turn-1::reasoning-1",
          metadataJson: undefined,
        },
      ],
    });
  });
});
