import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { resolveProjectGitCwd } from './git-cwd.pure.ts';

describe('resolveProjectGitCwd', () => {
  test('defaults to the project directory', () => {
    expect(
      resolveProjectGitCwd({
        projectDirectory: '/repo/frontend',
        repositoryDirectory: '/repo',
        requestedCwd: null,
      }),
    ).toBe('/repo/frontend');
  });

  test('allows a project worktree directory', () => {
    expect(
      resolveProjectGitCwd({
        projectDirectory: '/repo/frontend',
        repositoryDirectory: '/repo',
        requestedCwd: '/repo/.worktrees/feature-a/frontend',
      }),
    ).toBe('/repo/.worktrees/feature-a/frontend');
  });

  test('rejects unrelated directories', () => {
    expect(() =>
      resolveProjectGitCwd({
        projectDirectory: '/repo/frontend',
        repositoryDirectory: '/repo',
        requestedCwd: '/tmp/other',
      }),
    ).toThrow('cwd is outside project worktrees: /tmp/other');
  });

  test('rejects sibling paths that only share a prefix', () => {
    expect(() =>
      resolveProjectGitCwd({
        projectDirectory: '/repo',
        repositoryDirectory: '/repo',
        requestedCwd: path.join('/repo', '.worktrees-other', 'feature-a'),
      }),
    ).toThrow('cwd is outside project worktrees');
  });
});
