import { safeParse, unknown } from 'valibot';

import type { RawEvent } from '@/shared/acp';

const parseUnknownJson = (value: string): unknown => {
  const parsed: unknown = JSON.parse(value);
  return parsed;
};

const getObjectValue = (value: unknown, key: string): unknown => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  if (!(key in value)) {
    return undefined;
  }

  const matchingEntry = Object.entries(value).find(([entryKey]) => entryKey === key);

  return matchingEntry?.[1];
};

const stringifyUnknown = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
};

const extractText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const text = getObjectValue(value, 'text');
  if (typeof text === 'string') {
    return text;
  }

  const title = getObjectValue(value, 'title');
  if (typeof title === 'string') {
    return title;
  }

  const content = getObjectValue(value, 'content');
  if (typeof content === 'string') {
    return content;
  }

  return stringifyUnknown(value);
};

const normalizePlanEvent = (value: unknown, rawText: string): RawEvent | null => {
  const entriesValue = getObjectValue(value, 'entries');
  if (!Array.isArray(entriesValue)) {
    return null;
  }

  return {
    type: 'plan',
    entries: entriesValue.map(extractText),
    rawText,
  };
};

const normalizeDiffEvent = (value: unknown, rawText: string): RawEvent | null => {
  const pathValue = getObjectValue(value, 'path');
  if (typeof pathValue !== 'string' || pathValue.length === 0) {
    return null;
  }

  const oldTextValue = getObjectValue(value, 'oldText');
  const newTextValue = getObjectValue(value, 'newText');

  return {
    type: 'diff',
    path: pathValue,
    oldText: typeof oldTextValue === 'string' ? oldTextValue : null,
    newText: typeof newTextValue === 'string' ? newTextValue : null,
    rawText,
  };
};

const normalizeTerminalEvent = (value: unknown, rawText: string): RawEvent | null => {
  const textValue = getObjectValue(value, 'text') ?? getObjectValue(value, 'output');
  if (typeof textValue !== 'string') {
    return null;
  }

  const terminalIdValue = getObjectValue(value, 'terminalId');

  return {
    type: 'terminal',
    terminalId: typeof terminalIdValue === 'string' ? terminalIdValue : null,
    text: textValue,
    rawText,
  };
};

export const normalizeRawEvent = (rawValue: unknown): RawEvent | null => {
  const rawText = stringifyUnknown(rawValue);
  const parsedValue = typeof rawValue === 'string' ? parseUnknownJson(rawValue) : rawValue;
  const looseObject = safeParse(unknown(), parsedValue);
  if (!looseObject.success) {
    return null;
  }

  const typeValue = getObjectValue(looseObject.output, 'type');
  if (typeValue === 'plan') {
    return normalizePlanEvent(looseObject.output, rawText);
  }

  if (typeValue === 'diff') {
    return normalizeDiffEvent(looseObject.output, rawText);
  }

  if (typeValue === 'terminal') {
    return normalizeTerminalEvent(looseObject.output, rawText);
  }

  return null;
};
