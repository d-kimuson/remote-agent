import type { ChatMessage, RawEvent } from '../../../../shared/acp.ts';

import { type AcpToolMergeItem, planRawEventsForRender } from './acp-event-plan.pure.ts';

const nonEmpty = (value: string): string | null => {
  const text = value.trimEnd();
  return text.length > 0 ? text : null;
};

const section = (title: string, value: string): string | null => {
  const text = nonEmpty(value);
  return text === null ? null : `${title}\n${text}`;
};

const joinSections = (sections: readonly (string | null)[]): string =>
  sections
    .reduce<string[]>((acc, entry) => (entry === null ? acc : [...acc, entry]), [])
    .join('\n\n');

export const rawEventClipboardText = (event: RawEvent): string => {
  if (event.type === 'reasoning') {
    return section('思考 (thinking)', event.text) ?? '';
  }
  if (event.type === 'toolInput') {
    return section('ツール入力 (tool-input)', event.text.length > 0 ? event.text : '（空）') ?? '';
  }
  if (event.type === 'streamPart') {
    return section(`ストリーム · ${event.partType}`, event.text) ?? '';
  }
  if (event.type === 'plan') {
    return section('プラン (plan)', event.entries.join('\n')) ?? '';
  }
  if (event.type === 'diff') {
    return (
      section(
        `差分 · ${event.path}`,
        `--- old\n${event.oldText ?? ''}\n--- new\n${event.newText ?? ''}`.trimEnd(),
      ) ?? ''
    );
  }
  if (event.type === 'terminal') {
    return section('ターミナル (terminal)', event.text) ?? '';
  }
  if (event.type === 'toolCall') {
    return (
      section(
        `ツール入力 · ${event.toolName}`,
        event.inputText.length > 0 ? event.inputText : '（空）',
      ) ?? ''
    );
  }
  if (event.type === 'toolResult') {
    return section(`ツール戻り値 · ${event.toolName}`, event.outputText) ?? '';
  }
  if (event.type === 'toolError') {
    return section(`ツールエラー · ${event.toolName}`, event.errorText) ?? '';
  }

  const exhaustive: never = event;
  return exhaustive;
};

export const toolBlockClipboardText = (item: AcpToolMergeItem): string =>
  joinSections([
    item.call === null
      ? null
      : section(
          `入力 (args) · ${item.call.toolName}`,
          item.call.inputText.length > 0 ? item.call.inputText : '（空）',
        ),
    item.error === null ? null : section(`エラー · ${item.error.toolName}`, item.error.errorText),
    item.result === null
      ? null
      : section(`戻り値 (output) · ${item.result.toolName}`, item.result.outputText),
  ]);

export const chatMessageClipboardText = (message: ChatMessage): string => {
  const text = nonEmpty(message.text);
  const rawText = joinSections(
    planRawEventsForRender(message.rawEvents).map((item) =>
      item.type === 'tool' ? toolBlockClipboardText(item) : rawEventClipboardText(item.event),
    ),
  );
  return joinSections([text, nonEmpty(rawText)]);
};
