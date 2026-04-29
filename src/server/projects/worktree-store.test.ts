import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import type { Project } from '../../shared/acp.ts';

import { createWorktreeForProject } from './worktree-store.ts';

const runGit = async (cwd: string, args: readonly string[]): Promise<void> => {
  const { spawn } = await import('node:child_process');

  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', args, { cwd, shell: false, stdio: 'pipe' });
    const stderrChunks: string[] = [];

    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk.toString('utf8'));
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`git ${args.join(' ')} failed: ${stderrChunks.join('')}`));
    });
  });
};

const createProjectRepo = async (): Promise<Project> => {
  const repositoryDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-worktree-repo-'));

  await runGit(repositoryDirectory, ['init', '--initial-branch=main']);
  await runGit(repositoryDirectory, ['config', 'user.name', 'Remote Agent Test']);
  await runGit(repositoryDirectory, ['config', 'user.email', 'remote-agent@example.test']);
  await writeFile(path.join(repositoryDirectory, 'tracked.txt'), 'tracked\n');
  await runGit(repositoryDirectory, ['add', 'tracked.txt']);
  await runGit(repositoryDirectory, ['commit', '-m', 'initial']);

  return {
    id: 'repo',
    name: 'Repo',
    workingDirectory: repositoryDirectory,
  };
};

describe('createWorktreeForProject', () => {
  test('creates a git worktree below the source project .worktrees directory', async () => {
    const project = await createProjectRepo();

    const worktree = await createWorktreeForProject(project, { name: 'feature-a' });

    expect(worktree.createdAt.length).toBeGreaterThan(0);
    expect(worktree).toMatchObject({
      projectId: project.id,
      name: 'feature-a',
      path: path.join(project.workingDirectory, '.worktrees', 'feature-a'),
      branchName: 'ra/feature-a',
      baseRef: 'HEAD',
    });
    await expect(readFile(path.join(worktree.path, 'tracked.txt'), 'utf8')).resolves.toBe(
      'tracked\n',
    );
  });

  test('uses the requested branch name and base ref', async () => {
    const project = await createProjectRepo();
    await runGit(project.workingDirectory, ['checkout', '-b', 'base-branch']);
    await writeFile(path.join(project.workingDirectory, 'base.txt'), 'base\n');
    await runGit(project.workingDirectory, ['add', 'base.txt']);
    await runGit(project.workingDirectory, ['commit', '-m', 'base branch']);
    await runGit(project.workingDirectory, ['checkout', 'main']);

    const worktree = await createWorktreeForProject(project, {
      name: 'feature-from-base',
      branchName: 'ra/custom-branch',
      baseRef: 'base-branch',
    });

    expect(worktree.branchName).toBe('ra/custom-branch');
    expect(worktree.baseRef).toBe('base-branch');
    await expect(readFile(path.join(worktree.path, 'base.txt'), 'utf8')).resolves.toBe('base\n');
  });

  test('copies .worktreeinclude files and directories without overwriting existing files', async () => {
    const project = await createProjectRepo();
    await mkdir(path.join(project.workingDirectory, 'config'), { recursive: true });
    await writeFile(path.join(project.workingDirectory, '.env'), 'from-source\n');
    await writeFile(path.join(project.workingDirectory, 'tracked.txt'), 'dirty-source\n');
    await writeFile(
      path.join(project.workingDirectory, 'config', 'local.json'),
      '{"from":"source"}',
    );
    await writeFile(
      path.join(project.workingDirectory, '.worktreeinclude'),
      '\n# local files\n.env\ntracked.txt\nconfig\n',
    );

    const worktree = await createWorktreeForProject(project, { name: 'feature-b' });

    await expect(readFile(path.join(worktree.path, '.env'), 'utf8')).resolves.toBe('from-source\n');
    await expect(readFile(path.join(worktree.path, 'tracked.txt'), 'utf8')).resolves.toBe(
      'tracked\n',
    );
    await expect(readFile(path.join(worktree.path, 'config', 'local.json'), 'utf8')).resolves.toBe(
      '{"from":"source"}',
    );
  });
});
