import { describe, expect, test } from 'vitest';

import {
  appendRichPromptText,
  applyRichPromptFormat,
  filterSlashCommands,
  replaceRichPromptSelection,
  replaceSlashCommandQuery,
  slashCommandQueryFromPrompt,
} from './rich-prompt-editor.pure.ts';

describe('rich-prompt-editor.pure', () => {
  test('wraps the selected text with inline markdown marks', () => {
    expect(
      applyRichPromptFormat({
        value: 'hello world',
        selection: { start: 6, end: 11 },
        format: 'bold',
      }),
    ).toEqual({
      value: 'hello **world**',
      selection: { start: 8, end: 13 },
    });

    expect(
      applyRichPromptFormat({
        value: 'hello world',
        selection: { start: 0, end: 5 },
        format: 'code',
      }).value,
    ).toBe('`hello` world');
  });

  test('keeps the caret between inserted inline marks when there is no selection', () => {
    expect(
      applyRichPromptFormat({
        value: 'hello',
        selection: { start: 5, end: 5 },
        format: 'italic',
      }),
    ).toEqual({
      value: 'hello__',
      selection: { start: 6, end: 6 },
    });
  });

  test('prefixes selected lines for list and quote formatting', () => {
    expect(
      applyRichPromptFormat({
        value: 'first\nsecond\nthird',
        selection: { start: 7, end: 12 },
        format: 'bulletList',
      }).value,
    ).toBe('first\n- second\nthird');

    expect(
      applyRichPromptFormat({
        value: 'first\nsecond\nthird',
        selection: { start: 0, end: 12 },
        format: 'quote',
      }).value,
    ).toBe('> first\n> second\nthird');
  });

  test('replaces the selected range and moves the caret after the inserted text', () => {
    expect(
      replaceRichPromptSelection({
        value: 'hello world',
        selection: { start: 6, end: 11 },
        replacement: 'agent',
      }),
    ).toEqual({
      value: 'hello agent',
      selection: { start: 11, end: 11 },
    });
  });

  test('appends speech text with a single separator', () => {
    expect(appendRichPromptText({ value: '', addition: ' hello ' })).toBe('hello');
    expect(appendRichPromptText({ value: 'hello', addition: 'world' })).toBe('hello world');
    expect(appendRichPromptText({ value: 'hello ', addition: 'world' })).toBe('hello world');
    expect(appendRichPromptText({ value: 'hello', addition: ' ' })).toBe('hello');
  });

  test('detects slash command queries only at the active token', () => {
    expect(slashCommandQueryFromPrompt({ value: '/', selection: { start: 1, end: 1 } })).toBe('');
    expect(slashCommandQueryFromPrompt({ value: '/rev', selection: { start: 4, end: 4 } })).toBe(
      'rev',
    );
    expect(
      slashCommandQueryFromPrompt({ value: 'hello /rev', selection: { start: 10, end: 10 } }),
    ).toBeNull();
    expect(
      slashCommandQueryFromPrompt({ value: '/review now', selection: { start: 11, end: 11 } }),
    ).toBeNull();
  });

  test('filters and inserts slash command completions', () => {
    const commands = [
      { name: 'test', description: 'Run tests', inputHint: null },
      { name: 'review', description: 'Review changes', inputHint: 'scope' },
      { name: 'research', description: 'Research codebase', inputHint: null },
    ];

    expect(filterSlashCommands({ commands, query: 're' }).map((command) => command.name)).toEqual([
      'research',
      'review',
    ]);
    expect(
      replaceSlashCommandQuery({
        value: '/rev',
        selection: { start: 4, end: 4 },
        commandName: 'review',
      }),
    ).toEqual({
      value: '/review ',
      selection: { start: 8, end: 8 },
    });
  });
});
