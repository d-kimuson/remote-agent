import { streamText, type ModelMessage } from 'ai';

import {
  chatMessageRawEventsFromRaw,
  chatMessageTextFromRaw,
  type ChatMessage,
  type ChatMessageKind,
  type PersistedMessageRaw,
  type RawEvent,
} from '../../../shared/acp.ts';
import { normalizeRawEvent } from '../raw-event.pure.ts';

const stringifyForPersistence = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[unserializable]';
  }
};

export type PromptStreamInsertRow = {
  readonly id: string;
  readonly sessionId: string;
  readonly role: 'user' | 'assistant';
  readonly messageKind: ChatMessageKind;
  readonly textForSearch: string;
  readonly rawJson: PersistedMessageRaw;
  readonly streamPartId: string | null;
  readonly createdAt: string;
};

export type PromptStreamPersistence = {
  readonly insert: (row: PromptStreamInsertRow) => Promise<void>;
  readonly updateByStreamPartId: (input: {
    readonly sessionId: string;
    readonly streamPartId: string;
    readonly textForSearch: string;
    readonly rawJson: PersistedMessageRaw;
    readonly notify?: 'messages_updated' | 'none';
  }) => Promise<void>;
};

export type CollectPromptStreamResult = {
  readonly text: string;
  readonly rawEvents: readonly RawEvent[];
  readonly alreadyPersisted: true;
  readonly assistantSegmentMessages: readonly ChatMessage[];
};

type StreamBuffer = 'text' | 'reasoning' | 'tool_input';

const toChatMessage = (row: PromptStreamInsertRow): ChatMessage => ({
  id: row.id,
  role: row.role,
  kind: row.messageKind,
  rawJson: row.rawJson,
  textForSearch: row.textForSearch,
  text: chatMessageTextFromRaw(row.rawJson),
  rawEvents: [...chatMessageRawEventsFromRaw(row.rawJson)],
  createdAt: row.createdAt,
  streamPartId: row.streamPartId,
});

const streamBufferKey = (kind: StreamBuffer, id: string): string => `${kind}:${id}`;

const nextStreamBuffer = (
  current: { readonly text: string; readonly deltaCount: number } | undefined,
  delta: string,
): { readonly text: string; readonly deltaCount: number } => ({
  text: (current?.text ?? '') + delta,
  deltaCount: (current?.deltaCount ?? 0) + 1,
});

export const collectPromptStream = async (input: {
  readonly provider: {
    /**
     * Vercel `ai` SDK `LanguageModel` (the value for `streamText` `model`).
     */
    readonly languageModel: () => Parameters<typeof streamText>[0]['model'];
    readonly tools: Parameters<typeof streamText>[0]['tools'];
  };
  readonly prompt: string;
  readonly promptMessages?: readonly ModelMessage[];
  readonly sessionId: string;
  readonly now: () => string;
  readonly persistence: PromptStreamPersistence;
  readonly abortSignal?: AbortSignal;
  readonly onTextDelta?: (input: {
    readonly sessionId: string;
    readonly message: ChatMessage;
    readonly delta: string;
  }) => void;
  readonly onReasoningDelta?: (input: {
    readonly sessionId: string;
    readonly message: ChatMessage;
    readonly delta: string;
  }) => void;
}): Promise<CollectPromptStreamResult> => {
  const {
    provider,
    prompt,
    promptMessages,
    sessionId,
    now,
    persistence,
    abortSignal,
    onTextDelta,
    onReasoningDelta,
  } = input;
  const promptInput =
    promptMessages === undefined
      ? {
          prompt,
        }
      : {
          messages: [...promptMessages],
        };

  const result = streamText({
    abortSignal,
    includeRawChunks: true,
    model: provider.languageModel(),
    ...promptInput,
    tools: provider.tools,
  });

  const aggregatedText = { value: '' };
  const aggregatedRawEvents: RawEvent[] = [];
  const assistantSegmentMessages: ChatMessage[] = [];

  /** 同一 `sessionId` 内の複数回 `streamText` でも SDK の part.id が再利用され得るため、永続化キーにターンを混ぜる。 */
  const streamTurnId = crypto.randomUUID();
  const streamPartIdForRow = (rawStreamId: string): string => `${streamTurnId}::${rawStreamId}`;

  const streamBuffers = new Map<string, { readonly text: string; readonly deltaCount: number }>();
  const streamMessageIds = new Map<string, string>();
  const streamRawMessages = new Map<string, PersistedMessageRaw>();

  const pushSegment = (row: PromptStreamInsertRow): void => {
    assistantSegmentMessages.push(toChatMessage(row));
  };

  const insertRow = async (row: Omit<PromptStreamInsertRow, 'sessionId'>): Promise<void> => {
    const full: PromptStreamInsertRow = { ...row, sessionId };
    await persistence.insert(full);
    pushSegment(full);
  };

  const insertRaw = async (input: {
    readonly messageKind: ChatMessageKind;
    readonly rawJson: PersistedMessageRaw;
    readonly textForSearch?: string;
  }): Promise<void> => {
    await insertRow({
      id: crypto.randomUUID(),
      role: 'assistant',
      messageKind: input.messageKind,
      textForSearch: input.textForSearch ?? chatMessageTextFromRaw(input.rawJson),
      rawJson: input.rawJson,
      streamPartId: null,
      createdAt: input.rawJson.createdAt,
    });
  };

  const updateStreamRow = async (
    streamPartId: string,
    patch: {
      textForSearch: string;
      rawJson: PersistedMessageRaw;
      notify?: 'messages_updated' | 'none';
    },
  ): Promise<ChatMessage | null> => {
    await persistence.updateByStreamPartId({
      sessionId,
      streamPartId,
      textForSearch: patch.textForSearch,
      rawJson: patch.rawJson,
      notify: patch.notify,
    });
    const messageId = streamMessageIds.get(streamPartId);
    if (messageId === undefined) {
      return null;
    }
    const idx = assistantSegmentMessages.findIndex((m) => m.id === messageId);
    if (idx === -1) {
      return null;
    }
    const prev = assistantSegmentMessages[idx];
    if (prev === undefined) {
      return null;
    }
    const nextMessage = {
      ...prev,
      rawJson: patch.rawJson,
      textForSearch: patch.textForSearch,
      text: chatMessageTextFromRaw(patch.rawJson),
      rawEvents: [...chatMessageRawEventsFromRaw(patch.rawJson)],
    };
    assistantSegmentMessages[idx] = nextMessage;
    return nextMessage;
  };

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-start': {
        const partRowId = streamPartIdForRow(part.id);
        const id = partRowId;
        const createdAt = now();
        const rawJson: PersistedMessageRaw = {
          schemaVersion: 1,
          type: 'assistant_text',
          role: 'assistant',
          streamPartId: partRowId,
          providerStreamId: part.id,
          text: '',
          parts: { start: part },
          deltaCount: 0,
          createdAt,
        };
        streamMessageIds.set(partRowId, id);
        streamBuffers.set(streamBufferKey('text', part.id), { text: '', deltaCount: 0 });
        streamRawMessages.set(partRowId, rawJson);
        await insertRow({
          id,
          role: 'assistant',
          messageKind: 'assistant_text',
          textForSearch: '',
          rawJson,
          streamPartId: partRowId,
          createdAt,
        });
        break;
      }
      case 'text-delta': {
        const key = streamBufferKey('text', part.id);
        const next = nextStreamBuffer(streamBuffers.get(key), part.text);
        streamBuffers.set(key, next);
        aggregatedText.value += part.text;
        const partRowId = streamPartIdForRow(part.id);
        const prevRaw = streamRawMessages.get(partRowId);
        if (prevRaw?.type !== 'assistant_text') {
          break;
        }
        const rawJson: PersistedMessageRaw = {
          ...prevRaw,
          text: next.text,
          deltaCount: next.deltaCount,
        };
        streamRawMessages.set(partRowId, rawJson);
        const message = await updateStreamRow(partRowId, {
          textForSearch: next.text,
          rawJson,
          notify: 'none',
        });
        if (message !== null) {
          onTextDelta?.({ sessionId, message, delta: part.text });
        }
        break;
      }
      case 'text-end': {
        const key = streamBufferKey('text', part.id);
        const finalBuffer = streamBuffers.get(key) ?? { text: '', deltaCount: 0 };
        streamBuffers.delete(key);
        const partRowId = streamPartIdForRow(part.id);
        const prevRaw = streamRawMessages.get(partRowId);
        if (prevRaw?.type !== 'assistant_text') {
          break;
        }
        const rawJson: PersistedMessageRaw = {
          ...prevRaw,
          text: finalBuffer.text,
          deltaCount: finalBuffer.deltaCount,
          parts: { ...prevRaw.parts, end: part },
          endedAt: now(),
        };
        streamRawMessages.set(partRowId, rawJson);
        await updateStreamRow(partRowId, {
          textForSearch: finalBuffer.text,
          rawJson,
        });
        break;
      }
      case 'reasoning-start': {
        const partRowId = streamPartIdForRow(part.id);
        const id = partRowId;
        const createdAt = now();
        const rawJson: PersistedMessageRaw = {
          schemaVersion: 1,
          type: 'reasoning',
          role: 'assistant',
          streamPartId: partRowId,
          providerStreamId: part.id,
          text: '',
          parts: { start: part },
          deltaCount: 0,
          createdAt,
        };
        streamMessageIds.set(partRowId, id);
        streamBuffers.set(streamBufferKey('reasoning', part.id), { text: '', deltaCount: 0 });
        streamRawMessages.set(partRowId, rawJson);
        await insertRow({
          id,
          role: 'assistant',
          messageKind: 'reasoning',
          textForSearch: '',
          rawJson,
          streamPartId: partRowId,
          createdAt,
        });
        break;
      }
      case 'reasoning-delta': {
        const key = streamBufferKey('reasoning', part.id);
        const next = nextStreamBuffer(streamBuffers.get(key), part.text);
        streamBuffers.set(key, next);
        const partRowId = streamPartIdForRow(part.id);
        const prevRaw = streamRawMessages.get(partRowId);
        if (prevRaw?.type !== 'reasoning') {
          break;
        }
        const rawJson: PersistedMessageRaw = {
          ...prevRaw,
          text: next.text,
          deltaCount: next.deltaCount,
        };
        streamRawMessages.set(partRowId, rawJson);
        const message = await updateStreamRow(partRowId, {
          textForSearch: next.text,
          rawJson,
          notify: 'none',
        });
        if (message !== null) {
          onReasoningDelta?.({ sessionId, message, delta: part.text });
        }
        break;
      }
      case 'reasoning-end': {
        const key = streamBufferKey('reasoning', part.id);
        const finalBuffer = streamBuffers.get(key) ?? { text: '', deltaCount: 0 };
        const merged = finalBuffer.text;
        streamBuffers.delete(key);
        if (merged.length > 0) {
          aggregatedRawEvents.push({ type: 'reasoning', text: merged, rawText: merged });
        }
        const partRowId = streamPartIdForRow(part.id);
        const prevRaw = streamRawMessages.get(partRowId);
        if (prevRaw?.type !== 'reasoning') {
          break;
        }
        const rawJson: PersistedMessageRaw = {
          ...prevRaw,
          text: merged,
          deltaCount: finalBuffer.deltaCount,
          parts: { ...prevRaw.parts, end: part },
          endedAt: now(),
        };
        streamRawMessages.set(partRowId, rawJson);
        await updateStreamRow(partRowId, {
          textForSearch: merged,
          rawJson,
        });
        break;
      }
      case 'tool-input-start': {
        const partRowId = streamPartIdForRow(part.id);
        const id = partRowId;
        const createdAt = now();
        const rawJson: PersistedMessageRaw = {
          schemaVersion: 1,
          type: 'tool_input',
          role: 'assistant',
          streamPartId: partRowId,
          providerStreamId: part.id,
          text: '',
          toolName: part.toolName,
          providerExecuted: part.providerExecuted,
          dynamic: part.dynamic,
          title: part.title,
          parts: { start: part },
          deltaCount: 0,
          createdAt,
        };
        streamMessageIds.set(partRowId, id);
        streamBuffers.set(streamBufferKey('tool_input', part.id), { text: '', deltaCount: 0 });
        streamRawMessages.set(partRowId, rawJson);
        await insertRow({
          id,
          role: 'assistant',
          messageKind: 'tool_input',
          textForSearch: '',
          rawJson,
          streamPartId: partRowId,
          createdAt,
        });
        break;
      }
      case 'tool-input-delta': {
        const key = streamBufferKey('tool_input', part.id);
        const next = nextStreamBuffer(streamBuffers.get(key), part.delta);
        streamBuffers.set(key, next);
        const partRowId = streamPartIdForRow(part.id);
        const prevRaw = streamRawMessages.get(partRowId);
        if (prevRaw?.type !== 'tool_input') {
          break;
        }
        const rawJson: PersistedMessageRaw = {
          ...prevRaw,
          text: next.text,
          deltaCount: next.deltaCount,
        };
        streamRawMessages.set(partRowId, rawJson);
        await updateStreamRow(partRowId, {
          textForSearch: next.text,
          rawJson,
          notify: 'none',
        });
        break;
      }
      case 'tool-input-end': {
        const key = streamBufferKey('tool_input', part.id);
        const finalBuffer = streamBuffers.get(key) ?? { text: '', deltaCount: 0 };
        const merged = finalBuffer.text;
        streamBuffers.delete(key);
        aggregatedRawEvents.push({
          type: 'toolInput',
          streamId: part.id,
          text: merged,
          rawText: merged,
        });
        const partRowId = streamPartIdForRow(part.id);
        const prevRaw = streamRawMessages.get(partRowId);
        if (prevRaw?.type !== 'tool_input') {
          break;
        }
        const rawJson: PersistedMessageRaw = {
          ...prevRaw,
          text: merged,
          deltaCount: finalBuffer.deltaCount,
          parts: { ...prevRaw.parts, end: part },
          endedAt: now(),
        };
        streamRawMessages.set(partRowId, rawJson);
        await updateStreamRow(partRowId, {
          textForSearch: merged,
          rawJson,
        });
        break;
      }
      case 'source': {
        const text = stringifyForPersistence(part);
        await insertRaw({
          messageKind: 'source',
          rawJson: { schemaVersion: 1, type: 'source', role: 'assistant', part, createdAt: now() },
          textForSearch: text,
        });
        aggregatedRawEvents.push({
          type: 'streamPart',
          partType: 'source',
          text,
          rawText: text,
        });
        break;
      }
      case 'file': {
        const text = stringifyForPersistence(part.file);
        await insertRaw({
          messageKind: 'file',
          rawJson: { schemaVersion: 1, type: 'file', role: 'assistant', part, createdAt: now() },
          textForSearch: text,
        });
        aggregatedRawEvents.push({
          type: 'streamPart',
          partType: 'file',
          text,
          rawText: text,
        });
        break;
      }
      case 'tool-call': {
        const input = 'input' in part ? (part as { input: unknown }).input : undefined;
        const toolCallId = part.toolCallId;
        const toolName = part.toolName;
        const inputText = stringifyForPersistence(input);
        const ev: RawEvent = {
          type: 'toolCall',
          toolCallId,
          toolName,
          inputText,
          rawText: stringifyForPersistence({ toolName, input }),
        };
        aggregatedRawEvents.push(ev);
        await insertRaw({
          messageKind: 'tool_call',
          rawJson: {
            schemaVersion: 1,
            type: 'tool_call',
            role: 'assistant',
            toolCallId,
            toolName,
            part,
            createdAt: now(),
          },
          textForSearch: inputText,
        });
        break;
      }
      case 'tool-result': {
        const output = 'output' in part ? (part as { output: unknown }).output : undefined;
        const outputText = stringifyForPersistence(output);
        const ev: RawEvent = {
          type: 'toolResult',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          outputText,
          rawText: stringifyForPersistence(part),
        };
        aggregatedRawEvents.push(ev);
        await insertRaw({
          messageKind: 'tool_result',
          rawJson: {
            schemaVersion: 1,
            type: 'tool_result',
            role: 'assistant',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            part,
            createdAt: now(),
          },
          textForSearch: outputText,
        });
        break;
      }
      case 'tool-error': {
        const errorValue = 'error' in part ? (part as { error: unknown }).error : undefined;
        const ev: RawEvent = {
          type: 'toolError',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          errorText: stringifyForPersistence(errorValue),
          rawText: stringifyForPersistence(part),
        };
        aggregatedRawEvents.push(ev);
        await insertRaw({
          messageKind: 'tool_error',
          rawJson: {
            schemaVersion: 1,
            type: 'tool_error',
            role: 'assistant',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            part,
            createdAt: now(),
          },
          textForSearch: ev.errorText,
        });
        break;
      }
      case 'tool-output-denied': {
        const t = stringifyForPersistence(part);
        await insertRaw({
          messageKind: 'tool_output_denied',
          rawJson: {
            schemaVersion: 1,
            type: 'tool_output_denied',
            role: 'assistant',
            part,
            createdAt: now(),
          },
          textForSearch: t,
        });
        aggregatedRawEvents.push({
          type: 'streamPart',
          partType: 'tool-output-denied',
          text: t,
          rawText: t,
        });
        break;
      }
      case 'tool-approval-request': {
        const t = stringifyForPersistence(part);
        await insertRaw({
          messageKind: 'tool_approval_request',
          rawJson: {
            schemaVersion: 1,
            type: 'tool_approval_request',
            role: 'assistant',
            part,
            createdAt: now(),
          },
          textForSearch: t,
        });
        aggregatedRawEvents.push({
          type: 'streamPart',
          partType: 'tool-approval-request',
          text: t,
          rawText: t,
        });
        break;
      }
      case 'start-step': {
        const t = stringifyForPersistence({ request: part.request, warnings: part.warnings });
        await insertRaw({
          messageKind: 'step_start',
          rawJson: {
            schemaVersion: 1,
            type: 'step_start',
            role: 'assistant',
            part,
            createdAt: now(),
          },
          textForSearch: t,
        });
        aggregatedRawEvents.push({
          type: 'streamPart',
          partType: 'start-step',
          text: t,
          rawText: t,
        });
        break;
      }
      case 'finish-step': {
        const t = stringifyForPersistence({
          response: part.response,
          usage: part.usage,
          finishReason: part.finishReason,
          rawFinishReason: part.rawFinishReason,
          providerMetadata: part.providerMetadata,
        });
        await insertRaw({
          messageKind: 'step_finish',
          rawJson: {
            schemaVersion: 1,
            type: 'step_finish',
            role: 'assistant',
            part,
            createdAt: now(),
          },
          textForSearch: t,
        });
        aggregatedRawEvents.push({
          type: 'streamPart',
          partType: 'finish-step',
          text: t,
          rawText: t,
        });
        break;
      }
      case 'start': {
        await insertRaw({
          messageKind: 'stream_start',
          rawJson: {
            schemaVersion: 1,
            type: 'stream_start',
            role: 'assistant',
            part,
            createdAt: now(),
          },
          textForSearch: '',
        });
        aggregatedRawEvents.push({ type: 'streamPart', partType: 'start', text: '', rawText: '' });
        break;
      }
      case 'finish': {
        const t = stringifyForPersistence({
          finishReason: part.finishReason,
          rawFinishReason: part.rawFinishReason,
          totalUsage: part.totalUsage,
        });
        await insertRaw({
          messageKind: 'stream_finish',
          rawJson: {
            schemaVersion: 1,
            type: 'stream_finish',
            role: 'assistant',
            part,
            createdAt: now(),
          },
          textForSearch: t,
        });
        aggregatedRawEvents.push({ type: 'streamPart', partType: 'finish', text: t, rawText: t });
        break;
      }
      case 'abort': {
        const t = stringifyForPersistence({ reason: part.reason });
        await insertRaw({
          messageKind: 'abort',
          rawJson: { schemaVersion: 1, type: 'abort', role: 'assistant', part, createdAt: now() },
          textForSearch: t,
        });
        aggregatedRawEvents.push({ type: 'streamPart', partType: 'abort', text: t, rawText: t });
        break;
      }
      case 'error': {
        const t = stringifyForPersistence({ error: part.error });
        await insertRaw({
          messageKind: 'stream_error',
          rawJson: {
            schemaVersion: 1,
            type: 'stream_error',
            role: 'assistant',
            part,
            createdAt: now(),
          },
          textForSearch: t,
        });
        aggregatedRawEvents.push({ type: 'streamPart', partType: 'error', text: t, rawText: t });
        break;
      }
      case 'raw': {
        const rawEvent = normalizeRawEvent(part.rawValue);
        const t = stringifyForPersistence(part.rawValue);
        if (rawEvent !== null) {
          aggregatedRawEvents.push(rawEvent);
          await insertRaw({
            messageKind: 'raw_meta',
            rawJson: {
              schemaVersion: 1,
              type: 'raw_meta',
              role: 'assistant',
              text: t,
              part: part.rawValue,
              createdAt: now(),
            },
            textForSearch: t,
          });
        } else {
          await insertRaw({
            messageKind: 'raw_meta',
            rawJson: {
              schemaVersion: 1,
              type: 'raw_meta',
              role: 'assistant',
              text: t,
              part: { unnormalized: true, value: part.rawValue },
              createdAt: now(),
            },
            textForSearch: t,
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
