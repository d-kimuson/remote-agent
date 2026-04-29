import { describe, expect, test } from 'vitest';

import { resolveAuthMethodIdForPresetId } from './preset-auth-method-id.pure.ts';

describe('resolveAuthMethodIdForPresetId', () => {
  test('returns the configured auth method id for codex', () => {
    expect(resolveAuthMethodIdForPresetId('codex')).toBe('chatgpt');
  });

  test('returns undefined for unknown or missing presets', () => {
    expect(resolveAuthMethodIdForPresetId('claude-code')).toBeUndefined();
    expect(resolveAuthMethodIdForPresetId('')).toBeUndefined();
    expect(resolveAuthMethodIdForPresetId(null)).toBeUndefined();
    expect(resolveAuthMethodIdForPresetId(undefined)).toBeUndefined();
  });
});
