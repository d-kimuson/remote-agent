import { ACPLanguageModel } from '@mcpc-tech/acp-ai-provider';

const patchMarker = Symbol.for('remote-agent.acp-provider-tool-result-patch');

const stringifyUnknown = (value: unknown): string => {
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

const toAcpTextContentBlocks = (
  value: unknown,
): readonly [
  { readonly type: 'content'; readonly content: { readonly type: 'text'; readonly text: string } },
] => [
  {
    type: 'content',
    content: {
      type: 'text',
      text: stringifyUnknown(value),
    },
  },
];

export const normalizeFailedToolResultForAcpProvider = (parsed: unknown): unknown => {
  if (parsed === null || typeof parsed !== 'object') {
    return parsed;
  }

  const isError = Reflect.get(parsed, 'isError') === true;
  const toolResult: unknown = Reflect.get(parsed, 'toolResult');
  if (!isError || Array.isArray(toolResult)) {
    return parsed;
  }

  const toolCallId: unknown = Reflect.get(parsed, 'toolCallId');
  const toolName: unknown = Reflect.get(parsed, 'toolName');
  const status: unknown = Reflect.get(parsed, 'status');

  return {
    toolCallId,
    toolName,
    toolResult: toAcpTextContentBlocks(toolResult),
    isError,
    status,
  };
};

export const installAcpProviderToolResultPatch = (): void => {
  const prototype = ACPLanguageModel.prototype;
  if (Reflect.get(prototype, patchMarker) === true) {
    return;
  }

  const original: unknown = Reflect.get(prototype, 'parseToolResult');
  if (typeof original !== 'function') {
    return;
  }

  Reflect.set(
    prototype,
    'parseToolResult',
    function patchedParseToolResult(this: unknown, update: unknown): unknown {
      const parsed: unknown = Reflect.apply(original, this, [update]);
      return normalizeFailedToolResultForAcpProvider(parsed);
    },
  );
  Reflect.set(prototype, patchMarker, true);
};
