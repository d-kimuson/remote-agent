import { describe, expect, test } from 'vitest';

import {
  defaultTaskCompletionSoundPreference,
  isTaskCompletionSoundEnabled,
  parseTaskCompletionSoundPreference,
} from './task-completion-sound.pure.ts';

describe('parseTaskCompletionSoundPreference', () => {
  test('accepts supported task completion sound preferences', () => {
    expect(parseTaskCompletionSoundPreference('none')).toBe('none');
    expect(parseTaskCompletionSoundPreference('chime')).toBe('chime');
    expect(parseTaskCompletionSoundPreference('ping')).toBe('ping');
    expect(parseTaskCompletionSoundPreference('soft')).toBe('soft');
  });

  test('migrates legacy boolean-like values', () => {
    expect(parseTaskCompletionSoundPreference('enabled')).toBe('chime');
    expect(parseTaskCompletionSoundPreference('disabled')).toBe('none');
  });

  test('falls back to the default for missing or corrupted storage values', () => {
    expect(parseTaskCompletionSoundPreference(null)).toBe(defaultTaskCompletionSoundPreference);
    expect(parseTaskCompletionSoundPreference('muted')).toBe(defaultTaskCompletionSoundPreference);
    expect(parseTaskCompletionSoundPreference('')).toBe(defaultTaskCompletionSoundPreference);
  });
});

describe('isTaskCompletionSoundEnabled', () => {
  test('maps the preference to a boolean playback decision', () => {
    expect(isTaskCompletionSoundEnabled('chime')).toBe(true);
    expect(isTaskCompletionSoundEnabled('ping')).toBe(true);
    expect(isTaskCompletionSoundEnabled('soft')).toBe(true);
    expect(isTaskCompletionSoundEnabled('none')).toBe(false);
  });
});
