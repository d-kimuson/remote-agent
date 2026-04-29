import { describe, expect, test } from 'vitest';

import {
  canSendWithDraftWorktreeState,
  draftWorktreeNameError,
  normalizeDraftWorktreeName,
  shouldUsePreparedDraftSession,
} from './worktree-draft-session.pure.ts';

describe('normalizeDraftWorktreeName', () => {
  test('trims the input used for worktree creation', () => {
    expect(normalizeDraftWorktreeName('  feature-a  ')).toBe('feature-a');
  });
});

describe('shouldUsePreparedDraftSession', () => {
  test('uses prepared sessions only for normal draft sessions', () => {
    expect(
      shouldUsePreparedDraftSession({
        shouldUseDraftSession: true,
        useDraftWorktree: false,
      }),
    ).toBe(true);
  });

  test('skips prepared sessions when worktree creation is enabled', () => {
    expect(
      shouldUsePreparedDraftSession({
        shouldUseDraftSession: true,
        useDraftWorktree: true,
      }),
    ).toBe(false);
  });

  test('does not use prepared draft sessions outside the draft view', () => {
    expect(
      shouldUsePreparedDraftSession({
        shouldUseDraftSession: false,
        useDraftWorktree: false,
      }),
    ).toBe(false);
  });
});

describe('draftWorktreeNameError', () => {
  test('requires a non-empty name', () => {
    expect(draftWorktreeNameError('   ')).toBe('Worktree name is required.');
  });

  test('rejects path traversal', () => {
    expect(draftWorktreeNameError('../x')).toBe('Worktree name cannot contain path traversal.');
    expect(draftWorktreeNameError('feature/../x')).toBe(
      'Worktree name cannot contain path traversal.',
    );
  });

  test('rejects path separators', () => {
    expect(draftWorktreeNameError('/tmp/x')).toBe('Worktree name cannot contain path separators.');
    expect(draftWorktreeNameError('feature/x')).toBe(
      'Worktree name cannot contain path separators.',
    );
    expect(draftWorktreeNameError('feature\\x')).toBe(
      'Worktree name cannot contain path separators.',
    );
  });

  test('accepts a simple branch-like name segment', () => {
    expect(draftWorktreeNameError(' feature-a ')).toBeNull();
  });
});

describe('canSendWithDraftWorktreeState', () => {
  test('allows sending to an existing session without draft-only requirements', () => {
    expect(
      canSendWithDraftWorktreeState({
        activePresetId: '',
        isSending: false,
        promptText: 'hello',
        shouldUseDraftSession: false,
        useDraftWorktree: false,
        worktreeName: '',
      }),
    ).toBe(true);
  });

  test('requires a preset for draft sessions', () => {
    expect(
      canSendWithDraftWorktreeState({
        activePresetId: '',
        isSending: false,
        promptText: 'hello',
        shouldUseDraftSession: true,
        useDraftWorktree: false,
        worktreeName: '',
      }),
    ).toBe(false);
  });

  test('allows normal draft sending when prompt and preset are present', () => {
    expect(
      canSendWithDraftWorktreeState({
        activePresetId: 'codex',
        isSending: false,
        promptText: 'hello',
        shouldUseDraftSession: true,
        useDraftWorktree: false,
        worktreeName: '',
      }),
    ).toBe(true);
  });

  test('requires a non-empty worktree name when worktree creation is enabled', () => {
    expect(
      canSendWithDraftWorktreeState({
        activePresetId: 'codex',
        isSending: false,
        promptText: 'hello',
        shouldUseDraftSession: true,
        useDraftWorktree: true,
        worktreeName: '   ',
      }),
    ).toBe(false);
  });

  test('allows worktree draft sending after trimming the worktree name', () => {
    expect(
      canSendWithDraftWorktreeState({
        activePresetId: 'codex',
        isSending: false,
        promptText: 'hello',
        shouldUseDraftSession: true,
        useDraftWorktree: true,
        worktreeName: '  feature-a  ',
      }),
    ).toBe(true);
  });

  test('rejects invalid worktree names before sending', () => {
    expect(
      canSendWithDraftWorktreeState({
        activePresetId: 'codex',
        isSending: false,
        promptText: 'hello',
        shouldUseDraftSession: true,
        useDraftWorktree: true,
        worktreeName: '../x',
      }),
    ).toBe(false);
  });

  test('blocks sending while a request is pending', () => {
    expect(
      canSendWithDraftWorktreeState({
        activePresetId: 'codex',
        isSending: true,
        promptText: 'hello',
        shouldUseDraftSession: true,
        useDraftWorktree: true,
        worktreeName: 'feature-a',
      }),
    ).toBe(false);
  });
});
