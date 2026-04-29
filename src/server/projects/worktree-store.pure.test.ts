import { describe, expect, test } from 'vitest';

import {
  parseWorktreeInclude,
  validateGitRefArgument,
  validateWorktreeName,
} from './worktree-store.ts';

describe('parseWorktreeInclude', () => {
  test('ignores empty lines and comments', () => {
    expect(parseWorktreeInclude('\n# comment\n.env\n\nconfig/local.json\n')).toEqual({
      kind: 'ok',
      paths: ['.env', 'config/local.json'],
    });
  });

  test('rejects absolute paths', () => {
    expect(parseWorktreeInclude('/tmp/secret\n')).toEqual({
      kind: 'error',
      line: 1,
      path: '/tmp/secret',
      reason: 'absolute paths are not allowed',
    });
  });

  test('rejects parent traversal', () => {
    expect(parseWorktreeInclude('config/../secret\n')).toEqual({
      kind: 'error',
      line: 1,
      path: 'config/../secret',
      reason: 'parent traversal is not allowed',
    });
  });
});

describe('validateWorktreeName', () => {
  test('accepts a single relative path segment', () => {
    expect(validateWorktreeName('feature-a')).toEqual({ kind: 'ok', name: 'feature-a' });
  });

  test('rejects names that can escape the worktrees directory', () => {
    expect(validateWorktreeName('../feature-a')).toEqual({
      kind: 'error',
      reason: 'worktree name must be a single relative path segment',
    });
  });
});

describe('validateGitRefArgument', () => {
  test('accepts branch names with slashes', () => {
    expect(validateGitRefArgument('ra/feature-a', 'branchName')).toEqual({
      kind: 'ok',
      value: 'ra/feature-a',
    });
  });

  test('rejects option-like refs', () => {
    expect(validateGitRefArgument('--detach', 'baseRef')).toEqual({
      kind: 'error',
      reason: "baseRef must not start with '-'",
    });
  });
});
