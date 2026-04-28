import { streamText } from "ai";

import type { ChatMessage, ChatMessageKind, RawEvent } from "../../shared/acp.ts";
import { normalizeRawEvent } from "./raw-event.pure.ts";

const stringifyForPersistence = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable]";
  }
};

export type PromptStreamInsertRow = {
  readonly id: string;
  readonly sessionId: string;
  readonly role: "user" | "assistant";
  readonly messageKind: ChatMessageKind;
  readonly text: string;
  readonly rawEvents: readonly RawEvent[];
  readonly streamPartId: string | null;
  readonly metadataJson: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type PromptStreamPersistence = {
  readonly insert: (row: PromptStreamInsertRow) => Promise<void>;
  readonly updateByStreamPartId: (input: {
    readonly sessionId: string;
    readonly streamPartId: string;
    readonly text: string;
    readonly rawEvents: readonly RawEvent[];
    readonly metadataJson: string;
    readonly updatedAt: string;
  }) => Promise<void>;
};

export type CollectPromptStreamResult = {
  readonly text: string;
  readonly rawEvents: readonly RawEvent[];
  readonly alreadyPersisted: true;
  readonly assistantSegmentMessages: readonly ChatMessage[];
};

type StreamBuffer = "text" | "reasoning" | "tool_input";

const toChatMessage = (row: PromptStreamInsertRow): ChatMessage => ({
  id: row.id,
  role: row.role,
  kind: row.messageKind,
  text: row.text,
  rawEvents: [...row.rawEvents],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  streamPartId: row.streamPartId,
  metadataJson: row.metadataJson === "{}" ? undefined : row.metadataJson,
});

const streamBufferKey = (kind: StreamBuffer, id: string): string => `${kind}:${id}`;

export const collectPromptStream = async (input: {
  readonly provider: {
    /**
     * Vercel `ai` SDK `LanguageModel` (the value for `streamText` `model`).
     */
    readonly languageModel: () => Parameters<typeof streamText>[0]["model"];
    readonly tools: Parameters<typeof streamText>[0]["tools"];
  };
  readonly prompt: string;
  readonly sessionId: string;
  readonly now: () => string;
  readonly persistence: PromptStreamPersistence;
}): Promise<CollectPromptStreamResult> => {
  const { provider, prompt, sessionId, now, persistence } = input;

  const result = streamText({
    includeRawChunks: true,
    model: provider.languageModel(),
    prompt,
    tools: provider.tools,
  });

  const aggregatedText = { value: "" };
  const aggregatedRawEvents: RawEvent[] = [];
  const assistantSegmentMessages: ChatMessage[] = [];

  /** 同一 `sessionId` 内の複数回 `streamText` でも SDK の part.id が再利用され得るため、永続化キーにターンを混ぜる。 */
  const streamTurnId = crypto.randomUUID();
  const streamPartIdForRow = (rawStreamId: string): string => `${streamTurnId}::${rawStreamId}`;

  const streamBuffers = new Map<string, string>();
  const streamMessageIds = new Map<string, string>();

  const pushSegment = (row: PromptStreamInsertRow): void => {
    assistantSegmentMessages.push(toChatMessage(row));
  };

  const insertRow = async (row: Omit<PromptStreamInsertRow, "sessionId">): Promise<void> => {
    const full: PromptStreamInsertRow = { ...row, sessionId };
    await persistence.insert(full);
    pushSegment(full);
  };

  const updateStreamRow = async (
    streamPartId: string,
    patch: { text: string; rawEvents: readonly RawEvent[]; metadataJson?: string },
  ): Promise<void> => {
    const t = now();
    await persistence.updateByStreamPartId({
      sessionId,
      streamPartId,
      text: patch.text,
      rawEvents: patch.rawEvents,
      metadataJson: patch.metadataJson ?? "{}",
      updatedAt: t,
    });
    const messageId = streamMessageIds.get(streamPartId);
    if (messageId === undefined) {
      return;
    }
    const idx = assistantSegmentMessages.findIndex((m) => m.id === messageId);
    if (idx === -1) {
      return;
    }
    const prev = assistantSegmentMessages[idx];
    if (prev === undefined) {
      return;
    }
    assistantSegmentMessages[idx] = {
      ...prev,
      text: patch.text,
      rawEvents: [...patch.rawEvents],
      updatedAt: t,
      metadataJson: patch.metadataJson ?? prev.metadataJson,
    };
  };

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-start": {
        const id = crypto.randomUUID();
        const partRowId = streamPartIdForRow(part.id);
        streamMessageIds.set(partRowId, id);
        streamBuffers.set(streamBufferKey("text", part.id), "");
        await insertRow({
          id,
          role: "assistant",
          messageKind: "assistant_text",
          text: "",
          rawEvents: [],
          streamPartId: partRowId,
          metadataJson: stringifyForPersistence({ providerMetadata: part.providerMetadata }),
          createdAt: now(),
          updatedAt: now(),
        });
        break;
      }
      case "text-delta": {
        const key = streamBufferKey("text", part.id);
        const prev = streamBuffers.get(key) ?? "";
        const next = prev + part.text;
        streamBuffers.set(key, next);
        aggregatedText.value += part.text;
        await updateStreamRow(streamPartIdForRow(part.id), { text: next, rawEvents: [] });
        break;
      }
      case "text-end": {
        const key = streamBufferKey("text", part.id);
        const finalText = streamBuffers.get(key) ?? "";
        streamBuffers.delete(key);
        await updateStreamRow(streamPartIdForRow(part.id), {
          text: finalText,
          rawEvents: [],
          metadataJson: stringifyForPersistence({
            ended: true,
            providerMetadata: part.providerMetadata,
          }),
        });
        break;
      }
      case "reasoning-start": {
        const id = crypto.randomUUID();
        const partRowId = streamPartIdForRow(part.id);
        streamMessageIds.set(partRowId, id);
        streamBuffers.set(streamBufferKey("reasoning", part.id), "");
        await insertRow({
          id,
          role: "assistant",
          messageKind: "reasoning",
          text: "",
          rawEvents: [],
          streamPartId: partRowId,
          metadataJson: stringifyForPersistence({ providerMetadata: part.providerMetadata }),
          createdAt: now(),
          updatedAt: now(),
        });
        break;
      }
      case "reasoning-delta": {
        const key = streamBufferKey("reasoning", part.id);
        const prev = streamBuffers.get(key) ?? "";
        const next = prev + part.text;
        streamBuffers.set(key, next);
        await updateStreamRow(streamPartIdForRow(part.id), {
          text: next,
          rawEvents: [],
        });
        break;
      }
      case "reasoning-end": {
        const key = streamBufferKey("reasoning", part.id);
        const merged = streamBuffers.get(key) ?? "";
        streamBuffers.delete(key);
        if (merged.length > 0) {
          aggregatedRawEvents.push({ type: "reasoning", text: merged, rawText: merged });
        }
        await updateStreamRow(streamPartIdForRow(part.id), {
          text: merged,
          rawEvents:
            merged.length > 0 ? [{ type: "reasoning", text: merged, rawText: merged }] : [],
          metadataJson: stringifyForPersistence({
            ended: true,
            providerMetadata: part.providerMetadata,
          }),
        });
        break;
      }
      case "tool-input-start": {
        const id = crypto.randomUUID();
        const partRowId = streamPartIdForRow(part.id);
        streamMessageIds.set(partRowId, id);
        streamBuffers.set(streamBufferKey("tool_input", part.id), "");
        await insertRow({
          id,
          role: "assistant",
          messageKind: "tool_input",
          text: "",
          rawEvents: [],
          streamPartId: partRowId,
          metadataJson: stringifyForPersistence({
            toolName: part.toolName,
            providerExecuted: part.providerExecuted,
            dynamic: part.dynamic,
            title: part.title,
            providerMetadata: part.providerMetadata,
          }),
          createdAt: now(),
          updatedAt: now(),
        });
        break;
      }
      case "tool-input-delta": {
        const key = streamBufferKey("tool_input", part.id);
        const prev = streamBuffers.get(key) ?? "";
        const next = prev + part.delta;
        streamBuffers.set(key, next);
        await updateStreamRow(streamPartIdForRow(part.id), { text: next, rawEvents: [] });
        break;
      }
      case "tool-input-end": {
        const key = streamBufferKey("tool_input", part.id);
        const merged = streamBuffers.get(key) ?? "";
        streamBuffers.delete(key);
        aggregatedRawEvents.push({
          type: "toolInput",
          streamId: part.id,
          text: merged,
          rawText: merged,
        });
        await updateStreamRow(streamPartIdForRow(part.id), {
          text: merged,
          rawEvents: [],
          metadataJson: stringifyForPersistence({
            ended: true,
            providerMetadata: part.providerMetadata,
          }),
        });
        break;
      }
      case "source": {
        const text = stringifyForPersistence(part);
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "source",
          text,
          rawEvents: [],
          streamPartId: null,
          metadataJson: "{}",
          createdAt: now(),
          updatedAt: now(),
        });
        aggregatedRawEvents.push({
          type: "streamPart",
          partType: "source",
          text,
          rawText: text,
        });
        break;
      }
      case "file": {
        const text = stringifyForPersistence(part.file);
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "file",
          text,
          rawEvents: [],
          streamPartId: null,
          metadataJson: stringifyForPersistence(part.providerMetadata),
          createdAt: now(),
          updatedAt: now(),
        });
        aggregatedRawEvents.push({
          type: "streamPart",
          partType: "file",
          text,
          rawText: text,
        });
        break;
      }
      case "tool-call": {
        const input = "input" in part ? (part as { input: unknown }).input : undefined;
        const toolCallId = part.toolCallId;
        const toolName = part.toolName;
        const inputText = stringifyForPersistence(input);
        const ev: RawEvent = {
          type: "toolCall",
          toolCallId,
          toolName,
          inputText,
          rawText: stringifyForPersistence({ toolName, input }),
        };
        aggregatedRawEvents.push(ev);
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "tool_call",
          text: inputText,
          rawEvents: [ev],
          streamPartId: null,
          metadataJson: "{}",
          createdAt: now(),
          updatedAt: now(),
        });
        break;
      }
      case "tool-result": {
        const output = "output" in part ? (part as { output: unknown }).output : undefined;
        const outputText = stringifyForPersistence(output);
        const ev: RawEvent = {
          type: "toolResult",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          outputText,
          rawText: stringifyForPersistence(part),
        };
        aggregatedRawEvents.push(ev);
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "tool_result",
          text: outputText,
          rawEvents: [ev],
          streamPartId: null,
          metadataJson: JSON.stringify({ preliminary: part.preliminary === true }),
          createdAt: now(),
          updatedAt: now(),
        });
        break;
      }
      case "tool-error": {
        const errorValue = "error" in part ? (part as { error: unknown }).error : undefined;
        const ev: RawEvent = {
          type: "toolError",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          errorText: stringifyForPersistence(errorValue),
          rawText: stringifyForPersistence(part),
        };
        aggregatedRawEvents.push(ev);
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "tool_error",
          text: ev.errorText,
          rawEvents: [ev],
          streamPartId: null,
          metadataJson: "{}",
          createdAt: now(),
          updatedAt: now(),
        });
        break;
      }
      case "tool-output-denied": {
        const t = stringifyForPersistence(part);
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "tool_output_denied",
          text: t,
          rawEvents: [],
          streamPartId: null,
          metadataJson: stringifyForPersistence({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
          }),
          createdAt: now(),
          updatedAt: now(),
        });
        aggregatedRawEvents.push({
          type: "streamPart",
          partType: "tool-output-denied",
          text: t,
          rawText: t,
        });
        break;
      }
      case "tool-approval-request": {
        const t = stringifyForPersistence(part);
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "tool_approval_request",
          text: t,
          rawEvents: [],
          streamPartId: null,
          metadataJson: stringifyForPersistence({ approvalId: part.approvalId }),
          createdAt: now(),
          updatedAt: now(),
        });
        aggregatedRawEvents.push({
          type: "streamPart",
          partType: "tool-approval-request",
          text: t,
          rawText: t,
        });
        break;
      }
      case "start-step": {
        const t = stringifyForPersistence({ request: part.request, warnings: part.warnings });
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "step_start",
          text: t,
          rawEvents: [],
          streamPartId: null,
          metadataJson: "{}",
          createdAt: now(),
          updatedAt: now(),
        });
        aggregatedRawEvents.push({
          type: "streamPart",
          partType: "start-step",
          text: t,
          rawText: t,
        });
        break;
      }
      case "finish-step": {
        const t = stringifyForPersistence({
          response: part.response,
          usage: part.usage,
          finishReason: part.finishReason,
          rawFinishReason: part.rawFinishReason,
          providerMetadata: part.providerMetadata,
        });
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "step_finish",
          text: t,
          rawEvents: [],
          streamPartId: null,
          metadataJson: "{}",
          createdAt: now(),
          updatedAt: now(),
        });
        aggregatedRawEvents.push({
          type: "streamPart",
          partType: "finish-step",
          text: t,
          rawText: t,
        });
        break;
      }
      case "start": {
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "stream_start",
          text: "",
          rawEvents: [],
          streamPartId: null,
          metadataJson: "{}",
          createdAt: now(),
          updatedAt: now(),
        });
        aggregatedRawEvents.push({ type: "streamPart", partType: "start", text: "", rawText: "" });
        break;
      }
      case "finish": {
        const t = stringifyForPersistence({
          finishReason: part.finishReason,
          rawFinishReason: part.rawFinishReason,
          totalUsage: part.totalUsage,
        });
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "stream_finish",
          text: t,
          rawEvents: [],
          streamPartId: null,
          metadataJson: "{}",
          createdAt: now(),
          updatedAt: now(),
        });
        aggregatedRawEvents.push({ type: "streamPart", partType: "finish", text: t, rawText: t });
        break;
      }
      case "abort": {
        const t = stringifyForPersistence({ reason: part.reason });
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "abort",
          text: t,
          rawEvents: [],
          streamPartId: null,
          metadataJson: "{}",
          createdAt: now(),
          updatedAt: now(),
        });
        aggregatedRawEvents.push({ type: "streamPart", partType: "abort", text: t, rawText: t });
        break;
      }
      case "error": {
        const t = stringifyForPersistence({ error: part.error });
        await insertRow({
          id: crypto.randomUUID(),
          role: "assistant",
          messageKind: "stream_error",
          text: t,
          rawEvents: [],
          streamPartId: null,
          metadataJson: "{}",
          createdAt: now(),
          updatedAt: now(),
        });
        aggregatedRawEvents.push({ type: "streamPart", partType: "error", text: t, rawText: t });
        break;
      }
      case "raw": {
        const rawEvent = normalizeRawEvent(part.rawValue);
        const t = stringifyForPersistence(part.rawValue);
        if (rawEvent !== null) {
          aggregatedRawEvents.push(rawEvent);
          await insertRow({
            id: crypto.randomUUID(),
            role: "assistant",
            messageKind: "raw_meta",
            text: t,
            rawEvents: [rawEvent],
            streamPartId: null,
            metadataJson: "{}",
            createdAt: now(),
            updatedAt: now(),
          });
        } else {
          await insertRow({
            id: crypto.randomUUID(),
            role: "assistant",
            messageKind: "raw_meta",
            text: t,
            rawEvents: [],
            streamPartId: null,
            metadataJson: JSON.stringify({ unnormalized: true }),
            createdAt: now(),
            updatedAt: now(),
          });
        }
        break;
      }
      default: {
        const exhaustive: never = part;
        throw new Error(
          `Unhandled TextStreamPart branch: ${String((exhaustive as { type: string }).type)}`,
        );
      }
    }
  }

  return {
    text: aggregatedText.value,
    rawEvents: aggregatedRawEvents,
    alreadyPersisted: true,
    assistantSegmentMessages,
  };
};
