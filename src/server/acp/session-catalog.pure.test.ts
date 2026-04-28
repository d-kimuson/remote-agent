import { describe, expect, test } from 'vitest';

import {
  enrichModeOptionsIfEmpty,
  enrichModelOptionsIfEmpty,
  preferNonEmptyModeCatalog,
  preferNonEmptyModelCatalog,
} from './session-catalog.pure';

describe('enrichModelOptionsIfEmpty', () => {
  test('leaves non-empty list unchanged', () => {
    const one = { id: 'a', name: 'A', description: null as string | null };
    expect(enrichModelOptionsIfEmpty([one], 'a')).toEqual([one]);
  });

  test('synthesizes from current model id when list is empty', () => {
    expect(enrichModelOptionsIfEmpty([], 'gpt-5.4/low')).toEqual([
      { id: 'gpt-5.4/low', name: 'gpt-5.4/low', description: null },
    ]);
  });

  test('stays empty when no current id', () => {
    expect(enrichModelOptionsIfEmpty([], null)).toEqual([]);
  });
});

describe('enrichModeOptionsIfEmpty', () => {
  test('synthesizes from current mode id when list is empty', () => {
    expect(enrichModeOptionsIfEmpty([], 'auto')).toEqual([
      { id: 'auto', name: 'auto', description: null },
    ]);
  });
});

describe('preferNonEmptyModelCatalog', () => {
  const a = { id: 'm1', name: 'M1', description: null as string | null };

  test('prefers provider list when non-empty', () => {
    expect(preferNonEmptyModelCatalog([a], [])).toEqual([a]);
  });

  test('falls back to store when provider is empty', () => {
    expect(preferNonEmptyModelCatalog([], [a])).toEqual([a]);
  });
});

describe('preferNonEmptyModeCatalog', () => {
  const a = { id: 'balanced', name: 'Balanced', description: null as string | null };

  test('falls back to store when provider is empty', () => {
    expect(preferNonEmptyModeCatalog([], [a])).toEqual([a]);
  });
});
