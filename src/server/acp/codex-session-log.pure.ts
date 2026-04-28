import type { ChatMessage, RawEvent } from '../../shared/acp.ts';

type CodexSessionLogMeta = {
  readonly sessionId: string;
  readonly cwd: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

type CodexSessionLogImport = {
  readonly meta: CodexSessionLogMeta | null;
  readonly messages: readonly ChatMessage[];
};

const getObjectValue = (value: unknown, key: string): unknown => {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return undefined;
  }

  return Object.entries(value).find(([entryKey]) => entryKey === key)?.[1];
};

const stringifyUnknown = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[unserializable]';
  }
};

const stringifyJsonLikeString = (value: string): string => {
  try {
    const parsed: unknown = JSON.parse(value);
    return stringifyUnknown(parsed);
  } catch {
    return value;
  }
};

const stringifyToolInput = (value: unknown): string => {
  return typeof value === 'string' ? stringifyJsonLikeString(value) : stringifyUnknown(value);
};

const optionalObjectEntry = (key: string, value: unknown): readonly [string, unknown][] => {
  return value === undefined ? [] : [[key, value]];
};

const execCommandInputFromPayload = (payload: unknown): string => {
  return stringifyUnknown({
    ...Object.fromEntries(optionalObjectEntry('call_id', getObjectValue(payload, 'call_id'))),
    ...Object.fromEntries(optionalObjectEntry('process_id', getObjectValue(payload, 'process_id'))),
    ...Object.fromEntries(optionalObjectEntry('turn_id', getObjectValue(payload, 'turn_id'))),
    ...Object.fromEntries(optionalObjectEntry('command', getObjectValue(payload, 'command'))),
    ...Object.fromEntries(optionalObjectEntry('cwd', getObjectValue(payload, 'cwd'))),
    ...Object.fromEntries(optionalObjectEntry('parsed_cmd', getObjectValue(payload, 'parsed_cmd'))),
    ...Object.fromEntries(optionalObjectEntry('source', getObjectValue(payload, 'source'))),
  });
};

type ParsedJsonLine =
  | {
      readonly type: 'invalid';
    }
  | {
      readonly type: 'valid';
      readonly value: unknown;
    };

const parseJsonLine = (line: string): ParsedJsonLine => {
  try {
    const parsed: unknown = JSON.parse(line);
    return { type: 'valid', value: parsed };
  } catch {
    return { type: 'invalid' };
  }
};

const textItemsFromContent = (content: unknown): readonly string[] => {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.reduce<string[]>((texts, item) => {
    const text = getObjectValue(item, 'text');
    return typeof text === 'string' && text.length > 0 ? [...texts, text] : texts;
  }, []);
};

const isInjectedCodexContextText = (text: string): boolean => {
  const trimmed = text.trim();
  const startsWithAgents =
    trimmed.startsWith('# AGENTS.md instructions for ') ||
    trimmed.startsWith('AGENTS.md instructions for ');
  if (
    startsWithAgents &&
    trimmed.includes('<INSTRUCTIONS>') &&
    trimmed.endsWith('</INSTRUCTIONS>')
  ) {
    return true;
  }

  return trimmed.startsWith('<environment_context>') && trimmed.endsWith('</environment_context>');
};

const summaryTextFromReasoning = (summary: unknown): string => {
  if (!Array.isArray(summary)) {
    return '';
  }

  return summary
    .map((item) => getObjectValue(item, 'text'))
    .filter((text) => typeof text === 'string' && text.length > 0)
    .join('\n\n');
};

const buildMessage = ({
  sessionId,
  index,
  role,
  kind,
  text,
  rawEvents,
  timestamp,
  metadataJson = '{"source":"codex-session-log"}',
}: {
  readonly sessionId: string;
  readonly index: number;
  readonly role: ChatMessage['role'];
  readonly kind: NonNullable<ChatMessage['kind']>;
  readonly text: string;
  readonly rawEvents: readonly RawEvent[];
  readonly timestamp: string;
  readonly metadataJson?: string;
}): ChatMessage => ({
  id: `codex-log:${sessionId}:${index}`,
  role,
  kind,
  text,
  rawEvents: [...rawEvents],
  createdAt: timestamp,
  updatedAt: timestamp,
  streamPartId: null,
  metadataJson,
});

const stableIdFrom = ({
  fallbackSessionId,
  index,
  prefix,
  sourceId,
}: {
  readonly fallbackSessionId: string;
  readonly index: number;
  readonly prefix: string;
  readonly sourceId: unknown;
}): string =>
  typeof sourceId === 'string' && sourceId.length > 0
    ? `${prefix}:${sourceId}`
    : `${prefix}:${fallbackSessionId}:${index}`;

const buildImportedMessage = ({
  id,
  role,
  kind,
  text,
  rawEvents,
  timestamp,
  source,
}: {
  readonly id: string;
  readonly role: ChatMessage['role'];
  readonly kind: NonNullable<ChatMessage['kind']>;
  readonly text: string;
  readonly rawEvents: readonly RawEvent[];
  readonly timestamp: string;
  readonly source: string;
}): ChatMessage => ({
  id,
  role,
  kind,
  text,
  rawEvents: [...rawEvents],
  createdAt: timestamp,
  updatedAt: timestamp,
  streamPartId: null,
  metadataJson: JSON.stringify({ source }),
});

const messageFromCodexMessage = ({
  payload,
  sessionId,
  index,
  timestamp,
}: {
  readonly payload: unknown;
  readonly sessionId: string;
  readonly index: number;
  readonly timestamp: string;
}): ChatMessage | null => {
  const role = getObjectValue(payload, 'role');
  const text = textItemsFromContent(getObjectValue(payload, 'content')).join('\n\n');
  if (text.length === 0) {
    return null;
  }

  if (role === 'user') {
    if (isInjectedCodexContextText(text)) {
      return null;
    }

    return buildMessage({
      sessionId,
      index,
      role: 'user',
      kind: 'user',
      text,
      rawEvents: [],
      timestamp,
    });
  }

  if (role === 'assistant') {
    return buildMessage({
      sessionId,
      index,
      role: 'assistant',
      kind: 'assistant_text',
      text,
      rawEvents: [],
      timestamp,
    });
  }

  return null;
};

const reasoningMessageFromPayload = ({
  payload,
  sessionId,
  index,
  timestamp,
}: {
  readonly payload: unknown;
  readonly sessionId: string;
  readonly index: number;
  readonly timestamp: string;
}): ChatMessage | null => {
  const text = summaryTextFromReasoning(getObjectValue(payload, 'summary'));
  if (text.length === 0) {
    return null;
  }

  return buildMessage({
    sessionId,
    index,
    role: 'assistant',
    kind: 'reasoning',
    text,
    rawEvents: [{ type: 'reasoning', text, rawText: text }],
    timestamp,
  });
};

const toolCallMessageFromPayload = ({
  payload,
  sessionId,
  index,
  timestamp,
}: {
  readonly payload: unknown;
  readonly sessionId: string;
  readonly index: number;
  readonly timestamp: string;
}): ChatMessage | null => {
  const callId = getObjectValue(payload, 'call_id');
  const name = getObjectValue(payload, 'name');
  if (typeof callId !== 'string' || typeof name !== 'string') {
    return null;
  }

  const input = getObjectValue(payload, 'arguments') ?? getObjectValue(payload, 'input');
  const inputText = stringifyToolInput(input);
  const rawEvent: RawEvent = {
    type: 'toolCall',
    toolCallId: callId,
    toolName: name,
    inputText,
    rawText: inputText,
  };

  return buildMessage({
    sessionId,
    index,
    role: 'assistant',
    kind: 'tool_call',
    text: inputText,
    rawEvents: [rawEvent],
    timestamp,
  });
};

const execCommandCallMessageFromPayload = ({
  payload,
  sessionId,
  index,
  timestamp,
}: {
  readonly payload: unknown;
  readonly sessionId: string;
  readonly index: number;
  readonly timestamp: string;
}): ChatMessage | null => {
  const callId = getObjectValue(payload, 'call_id');
  if (typeof callId !== 'string') {
    return null;
  }

  const inputText = execCommandInputFromPayload(payload);
  const rawEvent: RawEvent = {
    type: 'toolCall',
    toolCallId: callId,
    toolName: 'exec_command',
    inputText,
    rawText: inputText,
  };

  return buildMessage({
    sessionId,
    index,
    role: 'assistant',
    kind: 'tool_call',
    text: inputText,
    rawEvents: [rawEvent],
    timestamp,
  });
};

const toolResultMessageFromPayload = ({
  payload,
  sessionId,
  index,
  timestamp,
  toolName,
}: {
  readonly payload: unknown;
  readonly sessionId: string;
  readonly index: number;
  readonly timestamp: string;
  readonly toolName: string;
}): ChatMessage | null => {
  const callId = getObjectValue(payload, 'call_id');
  if (typeof callId !== 'string') {
    return null;
  }

  const outputText = stringifyUnknown(getObjectValue(payload, 'output'));
  const rawEvent: RawEvent = {
    type: 'toolResult',
    toolCallId: callId,
    toolName,
    outputText,
    rawText: outputText,
  };

  return buildMessage({
    sessionId,
    index,
    role: 'assistant',
    kind: 'tool_result',
    text: outputText,
    rawEvents: [rawEvent],
    timestamp,
  });
};

const structuredToolResultMessageFromPayload = ({
  payload,
  sessionId,
  index,
  timestamp,
  toolName,
}: {
  readonly payload: unknown;
  readonly sessionId: string;
  readonly index: number;
  readonly timestamp: string;
  readonly toolName: string;
}): ChatMessage | null => {
  const callId = getObjectValue(payload, 'call_id');
  if (typeof callId !== 'string') {
    return null;
  }

  const outputText = stringifyUnknown(payload);
  const rawEvent: RawEvent = {
    type: 'toolResult',
    toolCallId: callId,
    toolName,
    outputText,
    rawText: outputText,
  };

  return buildMessage({
    sessionId,
    index,
    role: 'assistant',
    kind: 'tool_result',
    text: outputText,
    rawEvents: [rawEvent],
    timestamp,
  });
};

const metaFromLine = (line: unknown): CodexSessionLogMeta | null => {
  if (getObjectValue(line, 'type') !== 'session_meta') {
    return null;
  }

  const payload = getObjectValue(line, 'payload');
  const sessionId = getObjectValue(payload, 'id');
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return null;
  }

  const cwd = getObjectValue(payload, 'cwd');
  const createdAt = getObjectValue(payload, 'timestamp') ?? getObjectValue(line, 'timestamp');

  return {
    sessionId,
    cwd: typeof cwd === 'string' ? cwd : null,
    createdAt: typeof createdAt === 'string' ? createdAt : null,
    updatedAt: typeof createdAt === 'string' ? createdAt : null,
  };
};

export const parseCodexSessionLogText = (
  text: string,
  fallbackSessionId: string,
): CodexSessionLogImport => {
  const toolNamesByCallId = new Map<string, string>();
  const emittedToolCalls = new Set<string>();
  const emittedToolResults = new Set<string>();
  const messages: ChatMessage[] = [];
  let meta: CodexSessionLogMeta | null = null;
  let lastTimestamp: string | null = null;

  for (const line of text.split(/\r?\n/).filter((entry) => entry.trim().length > 0)) {
    const parsedLine = parseJsonLine(line);
    if (parsedLine.type === 'invalid') {
      continue;
    }

    const timestamp = getObjectValue(parsedLine.value, 'timestamp');
    const effectiveTimestamp: string =
      typeof timestamp === 'string' ? timestamp : (lastTimestamp ?? new Date(0).toISOString());
    lastTimestamp = effectiveTimestamp;

    const nextMeta = metaFromLine(parsedLine.value);
    if (nextMeta !== null) {
      meta = nextMeta;
      continue;
    }

    const lineType = getObjectValue(parsedLine.value, 'type');
    const payload = getObjectValue(parsedLine.value, 'payload');
    const payloadType = getObjectValue(payload, 'type');
    const sessionId = meta?.sessionId ?? fallbackSessionId;
    const index = messages.length;

    if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
      const callId = getObjectValue(payload, 'call_id');
      const name = getObjectValue(payload, 'name');
      if (typeof callId === 'string' && typeof name === 'string') {
        toolNamesByCallId.set(callId, name);
      }
    }

    const callId = getObjectValue(payload, 'call_id');
    const toolName =
      typeof callId === 'string' ? (toolNamesByCallId.get(callId) ?? 'tool') : 'tool';

    const nextMessage =
      lineType === 'response_item'
        ? payloadType === 'message'
          ? messageFromCodexMessage({ payload, sessionId, index, timestamp: effectiveTimestamp })
          : payloadType === 'reasoning'
            ? reasoningMessageFromPayload({
                payload,
                sessionId,
                index,
                timestamp: effectiveTimestamp,
              })
            : payloadType === 'function_call' || payloadType === 'custom_tool_call'
              ? toolCallMessageFromPayload({
                  payload,
                  sessionId,
                  index,
                  timestamp: effectiveTimestamp,
                })
              : (payloadType === 'function_call_output' ||
                    payloadType === 'custom_tool_call_output') &&
                  typeof callId === 'string' &&
                  !emittedToolResults.has(callId)
                ? toolResultMessageFromPayload({
                    payload,
                    sessionId,
                    index,
                    timestamp: effectiveTimestamp,
                    toolName,
                  })
                : null
        : lineType === 'event_msg' && payloadType === 'exec_command_end'
          ? typeof callId === 'string' && !emittedToolCalls.has(callId)
            ? execCommandCallMessageFromPayload({
                payload,
                sessionId,
                index,
                timestamp: effectiveTimestamp,
              })
            : structuredToolResultMessageFromPayload({
                payload,
                sessionId,
                index,
                timestamp: effectiveTimestamp,
                toolName: 'exec_command',
              })
          : lineType === 'event_msg' && payloadType === 'patch_apply_end'
            ? structuredToolResultMessageFromPayload({
                payload,
                sessionId,
                index,
                timestamp: effectiveTimestamp,
                toolName: 'apply_patch',
              })
            : null;

    if (nextMessage !== null) {
      const rawEvent = nextMessage.rawEvents[0];
      if (rawEvent?.type === 'toolCall') {
        emittedToolCalls.add(rawEvent.toolCallId);
      }
      if (rawEvent?.type === 'toolResult' || rawEvent?.type === 'toolError') {
        emittedToolResults.add(rawEvent.toolCallId);
      }
      messages.push(nextMessage);
    }

    if (
      lineType === 'event_msg' &&
      payloadType === 'exec_command_end' &&
      typeof callId === 'string' &&
      !emittedToolResults.has(callId)
    ) {
      const resultMessage = structuredToolResultMessageFromPayload({
        payload,
        sessionId,
        index: messages.length,
        timestamp: effectiveTimestamp,
        toolName: 'exec_command',
      });
      if (resultMessage !== null) {
        emittedToolResults.add(callId);
        messages.push(resultMessage);
      }
    }
  }

  return {
    meta:
      meta === null
        ? null
        : {
            ...meta,
            updatedAt: lastTimestamp ?? meta.updatedAt,
          },
    messages,
  };
};

const claudeAssistantMessagesFromContent = ({
  content,
  fallbackSessionId,
  sourceId,
  timestamp,
  startIndex,
}: {
  readonly content: unknown;
  readonly fallbackSessionId: string;
  readonly sourceId: unknown;
  readonly timestamp: string;
  readonly startIndex: number;
}): readonly ChatMessage[] => {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((item, offset): readonly ChatMessage[] => {
    const type = getObjectValue(item, 'type');
    const id = stableIdFrom({
      fallbackSessionId,
      index: startIndex + offset,
      prefix: 'claude-code-log',
      sourceId: offset === 0 ? sourceId : `${String(sourceId)}:${String(offset)}`,
    });

    if (type === 'text') {
      const textValue = getObjectValue(item, 'text');
      return typeof textValue === 'string' && textValue.length > 0
        ? [
            buildImportedMessage({
              id,
              role: 'assistant',
              kind: 'assistant_text',
              text: textValue,
              rawEvents: [],
              timestamp,
              source: 'claude-code-session-log',
            }),
          ]
        : [];
    }

    if (type === 'thinking') {
      const thinking = getObjectValue(item, 'thinking');
      return typeof thinking === 'string' && thinking.length > 0
        ? [
            buildImportedMessage({
              id,
              role: 'assistant',
              kind: 'reasoning',
              text: thinking,
              rawEvents: [{ type: 'reasoning', text: thinking, rawText: thinking }],
              timestamp,
              source: 'claude-code-session-log',
            }),
          ]
        : [];
    }

    if (type === 'tool_use') {
      const toolCallId = getObjectValue(item, 'id');
      const toolName = getObjectValue(item, 'name');
      if (typeof toolCallId !== 'string' || typeof toolName !== 'string') {
        return [];
      }
      const inputText = stringifyUnknown(getObjectValue(item, 'input'));
      return [
        buildImportedMessage({
          id,
          role: 'assistant',
          kind: 'tool_call',
          text: inputText,
          rawEvents: [
            {
              type: 'toolCall',
              toolCallId,
              toolName,
              inputText,
              rawText: inputText,
            },
          ],
          timestamp,
          source: 'claude-code-session-log',
        }),
      ];
    }

    return [];
  });
};

const claudeUserMessagesFromContent = ({
  content,
  fallbackSessionId,
  sourceId,
  timestamp,
  startIndex,
}: {
  readonly content: unknown;
  readonly fallbackSessionId: string;
  readonly sourceId: unknown;
  readonly timestamp: string;
  readonly startIndex: number;
}): readonly ChatMessage[] => {
  if (typeof content === 'string') {
    return content.trim().length > 0
      ? [
          buildImportedMessage({
            id: stableIdFrom({
              fallbackSessionId,
              index: startIndex,
              prefix: 'claude-code-log',
              sourceId,
            }),
            role: 'user',
            kind: 'user',
            text: content,
            rawEvents: [],
            timestamp,
            source: 'claude-code-session-log',
          }),
        ]
      : [];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((item, offset): readonly ChatMessage[] => {
    const type = getObjectValue(item, 'type');
    const id = stableIdFrom({
      fallbackSessionId,
      index: startIndex + offset,
      prefix: 'claude-code-log',
      sourceId: offset === 0 ? sourceId : `${String(sourceId)}:${String(offset)}`,
    });

    if (type === 'text') {
      const textValue = getObjectValue(item, 'text');
      return typeof textValue === 'string' && textValue.length > 0
        ? [
            buildImportedMessage({
              id,
              role: 'user',
              kind: 'user',
              text: textValue,
              rawEvents: [],
              timestamp,
              source: 'claude-code-session-log',
            }),
          ]
        : [];
    }

    if (type === 'tool_result') {
      const toolCallId = getObjectValue(item, 'tool_use_id');
      if (typeof toolCallId !== 'string') {
        return [];
      }
      const outputText = stringifyUnknown(getObjectValue(item, 'content'));
      const isError = getObjectValue(item, 'is_error') === true;
      return [
        buildImportedMessage({
          id,
          role: 'assistant',
          kind: isError ? 'tool_error' : 'tool_result',
          text: outputText,
          rawEvents: [
            isError
              ? {
                  type: 'toolError',
                  toolCallId,
                  toolName: 'tool',
                  errorText: outputText,
                  rawText: outputText,
                }
              : {
                  type: 'toolResult',
                  toolCallId,
                  toolName: 'tool',
                  outputText,
                  rawText: outputText,
                },
          ],
          timestamp,
          source: 'claude-code-session-log',
        }),
      ];
    }

    return [];
  });
};

export const parseClaudeCodeSessionLogText = (
  text: string,
  fallbackSessionId: string,
): CodexSessionLogImport => {
  const messages: ChatMessage[] = [];
  let meta: CodexSessionLogMeta | null = null;
  let lastTimestamp: string | null = null;

  for (const line of text.split(/\r?\n/).filter((entry) => entry.trim().length > 0)) {
    const parsedLine = parseJsonLine(line);
    if (parsedLine.type === 'invalid') {
      continue;
    }

    const timestamp = getObjectValue(parsedLine.value, 'timestamp');
    const effectiveTimestamp: string =
      typeof timestamp === 'string' ? timestamp : (lastTimestamp ?? new Date(0).toISOString());
    lastTimestamp = effectiveTimestamp;

    const lineType = getObjectValue(parsedLine.value, 'type');
    if (lineType !== 'user' && lineType !== 'assistant') {
      continue;
    }

    const sessionId = getObjectValue(parsedLine.value, 'sessionId');
    const cwd = getObjectValue(parsedLine.value, 'cwd');
    if (meta === null && typeof sessionId === 'string') {
      meta = {
        sessionId,
        cwd: typeof cwd === 'string' ? cwd : null,
        createdAt: effectiveTimestamp,
        updatedAt: effectiveTimestamp,
      };
    }

    const message = getObjectValue(parsedLine.value, 'message');
    const role = getObjectValue(message, 'role');
    const content = getObjectValue(message, 'content');
    const sourceId = getObjectValue(parsedLine.value, 'uuid');
    const sessionIdForMessage = meta?.sessionId ?? fallbackSessionId;
    const nextMessages =
      role === 'user'
        ? claudeUserMessagesFromContent({
            content,
            fallbackSessionId: sessionIdForMessage,
            sourceId,
            timestamp: effectiveTimestamp,
            startIndex: messages.length,
          })
        : role === 'assistant'
          ? claudeAssistantMessagesFromContent({
              content,
              fallbackSessionId: sessionIdForMessage,
              sourceId,
              timestamp: effectiveTimestamp,
              startIndex: messages.length,
            })
          : [];
    messages.push(...nextMessages);
  }

  return {
    meta: meta === null ? null : { ...meta, updatedAt: lastTimestamp ?? meta.updatedAt },
    messages,
  };
};

const piMessagesFromContent = ({
  content,
  fallbackSessionId,
  messageRole,
  sourceId,
  timestamp,
  startIndex,
}: {
  readonly content: unknown;
  readonly fallbackSessionId: string;
  readonly messageRole: unknown;
  readonly sourceId: unknown;
  readonly timestamp: string;
  readonly startIndex: number;
}): readonly ChatMessage[] => {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((item, offset): readonly ChatMessage[] => {
    const type = getObjectValue(item, 'type');
    const id = stableIdFrom({
      fallbackSessionId,
      index: startIndex + offset,
      prefix: 'pi-agent-log',
      sourceId: offset === 0 ? sourceId : `${String(sourceId)}:${String(offset)}`,
    });

    if (messageRole === 'user' && type === 'text') {
      const textValue = getObjectValue(item, 'text');
      return typeof textValue === 'string' && textValue.length > 0
        ? [
            buildImportedMessage({
              id,
              role: 'user',
              kind: 'user',
              text: textValue,
              rawEvents: [],
              timestamp,
              source: 'pi-coding-agent-session-log',
            }),
          ]
        : [];
    }

    if (messageRole === 'assistant' && type === 'text') {
      const textValue = getObjectValue(item, 'text');
      return typeof textValue === 'string' && textValue.length > 0
        ? [
            buildImportedMessage({
              id,
              role: 'assistant',
              kind: 'assistant_text',
              text: textValue,
              rawEvents: [],
              timestamp,
              source: 'pi-coding-agent-session-log',
            }),
          ]
        : [];
    }

    if (messageRole === 'assistant' && type === 'thinking') {
      const thinking = getObjectValue(item, 'thinking');
      return typeof thinking === 'string' && thinking.length > 0
        ? [
            buildImportedMessage({
              id,
              role: 'assistant',
              kind: 'reasoning',
              text: thinking,
              rawEvents: [{ type: 'reasoning', text: thinking, rawText: thinking }],
              timestamp,
              source: 'pi-coding-agent-session-log',
            }),
          ]
        : [];
    }

    if (messageRole === 'assistant' && type === 'toolCall') {
      const toolCallId = getObjectValue(item, 'id');
      const toolName = getObjectValue(item, 'name');
      if (typeof toolCallId !== 'string' || typeof toolName !== 'string') {
        return [];
      }
      const inputText = stringifyUnknown(getObjectValue(item, 'arguments'));
      return [
        buildImportedMessage({
          id,
          role: 'assistant',
          kind: 'tool_call',
          text: inputText,
          rawEvents: [
            {
              type: 'toolCall',
              toolCallId,
              toolName,
              inputText,
              rawText: inputText,
            },
          ],
          timestamp,
          source: 'pi-coding-agent-session-log',
        }),
      ];
    }

    if (messageRole === 'toolResult' && type === 'text') {
      const textValue = getObjectValue(item, 'text');
      return typeof textValue === 'string'
        ? [
            buildImportedMessage({
              id,
              role: 'assistant',
              kind: 'tool_result',
              text: textValue,
              rawEvents: [],
              timestamp,
              source: 'pi-coding-agent-session-log',
            }),
          ]
        : [];
    }

    return [];
  });
};

export const parsePiCodingAgentSessionLogText = (
  text: string,
  fallbackSessionId: string,
): CodexSessionLogImport => {
  const messages: ChatMessage[] = [];
  let meta: CodexSessionLogMeta | null = null;
  let lastTimestamp: string | null = null;

  for (const line of text.split(/\r?\n/).filter((entry) => entry.trim().length > 0)) {
    const parsedLine = parseJsonLine(line);
    if (parsedLine.type === 'invalid') {
      continue;
    }

    const timestamp = getObjectValue(parsedLine.value, 'timestamp');
    const effectiveTimestamp: string =
      typeof timestamp === 'string' ? timestamp : (lastTimestamp ?? new Date(0).toISOString());
    lastTimestamp = effectiveTimestamp;

    if (getObjectValue(parsedLine.value, 'type') === 'session') {
      const sessionId = getObjectValue(parsedLine.value, 'id');
      const cwd = getObjectValue(parsedLine.value, 'cwd');
      if (typeof sessionId === 'string') {
        meta = {
          sessionId,
          cwd: typeof cwd === 'string' ? cwd : null,
          createdAt: effectiveTimestamp,
          updatedAt: effectiveTimestamp,
        };
      }
      continue;
    }

    if (getObjectValue(parsedLine.value, 'type') !== 'message') {
      continue;
    }

    const message = getObjectValue(parsedLine.value, 'message');
    const messageRole = getObjectValue(message, 'role');
    const sourceId = getObjectValue(parsedLine.value, 'id');
    const sessionIdForMessage = meta?.sessionId ?? fallbackSessionId;
    const rawNextMessages = piMessagesFromContent({
      content: getObjectValue(message, 'content'),
      fallbackSessionId: sessionIdForMessage,
      messageRole,
      sourceId,
      timestamp: effectiveTimestamp,
      startIndex: messages.length,
    });

    if (messageRole === 'toolResult') {
      const toolCallId = getObjectValue(message, 'toolCallId');
      const toolName = getObjectValue(message, 'toolName');
      const isError = getObjectValue(message, 'isError') === true;
      const nextMessages = rawNextMessages.map((message): ChatMessage => {
        if (typeof toolCallId !== 'string' || typeof toolName !== 'string') {
          return message;
        }
        const rawEvent: RawEvent = isError
          ? {
              type: 'toolError',
              toolCallId,
              toolName,
              errorText: message.text,
              rawText: message.text,
            }
          : {
              type: 'toolResult',
              toolCallId,
              toolName,
              outputText: message.text,
              rawText: message.text,
            };
        return {
          ...message,
          kind: isError ? 'tool_error' : 'tool_result',
          rawEvents: [rawEvent],
        };
      });
      messages.push(...nextMessages);
    } else {
      messages.push(...rawNextMessages);
    }
  }

  return {
    meta: meta === null ? null : { ...meta, updatedAt: lastTimestamp ?? meta.updatedAt },
    messages,
  };
};
