import { spawn } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'valibot';

import {
  projectWorktreeSchema,
  type CreateProjectWorktreeRequest,
  type Project,
  type ProjectWorktree,
} from '../../shared/acp.ts';
import { getProject } from './project-store.ts';

type ValidationResult =
  | { readonly kind: 'ok'; readonly name: string }
  | { readonly kind: 'error'; readonly reason: string };

type GitRefValidationResult =
  | { readonly kind: 'ok'; readonly value: string }
  | { readonly kind: 'error'; readonly reason: string };

type IncludeParseResult =
  | { readonly kind: 'ok'; readonly paths: readonly string[] }
  | {
      readonly kind: 'error';
      readonly line: number;
      readonly path: string;
      readonly reason: string;
    };

type GitRunner = (cwd: string, args: readonly string[]) => Promise<void>;
type SetupScriptRunner = (cwd: string, script: string) => Promise<void>;

const hasParentTraversal = (value: string): boolean => {
  return value.split(/[\\/]+/).includes('..');
};

const hasPathSeparator = (value: string): boolean => {
  return value.includes('/') || value.includes('\\');
};

export const validateWorktreeName = (name: string): ValidationResult => {
  const trimmedName = name.trim();
  const invalid =
    trimmedName.length === 0 ||
    trimmedName === '.' ||
    trimmedName === '..' ||
    path.isAbsolute(trimmedName) ||
    path.win32.isAbsolute(trimmedName) ||
    hasParentTraversal(trimmedName) ||
    hasPathSeparator(trimmedName);

  if (invalid) {
    return {
      kind: 'error',
      reason: 'worktree name must be a single relative path segment',
    };
  }

  return { kind: 'ok', name: trimmedName };
};

export const validateGitRefArgument = (value: string, label: string): GitRefValidationResult => {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return { kind: 'error', reason: `${label} must not be empty` };
  }
  if (trimmedValue.startsWith('-')) {
    return { kind: 'error', reason: `${label} must not start with '-'` };
  }
  return { kind: 'ok', value: trimmedValue };
};

const validateIncludePath = (includePath: string): ValidationResult => {
  if (path.isAbsolute(includePath) || path.win32.isAbsolute(includePath)) {
    return { kind: 'error', reason: 'absolute paths are not allowed' };
  }
  if (hasParentTraversal(includePath)) {
    return { kind: 'error', reason: 'parent traversal is not allowed' };
  }
  if (includePath === '.' || includePath.length === 0) {
    return { kind: 'error', reason: 'empty paths are not allowed' };
  }

  return { kind: 'ok', name: path.normalize(includePath) };
};

export const parseWorktreeInclude = (content: string): IncludeParseResult => {
  const lines = content.split(/\r?\n/);
  const paths: string[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
      continue;
    }

    const result = validateIncludePath(trimmedLine);
    if (result.kind === 'error') {
      return {
        kind: 'error',
        line: lineIndex + 1,
        path: trimmedLine,
        reason: result.reason,
      };
    }

    paths.push(result.name);
  }

  return { kind: 'ok', paths };
};

const runGit: GitRunner = async (cwd, args) => {
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

const runSetupScript: SetupScriptRunner = async (cwd, script) => {
  if (script.trim().length === 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', script], { cwd, shell: false, stdio: 'pipe' });
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
      reject(new Error(`worktree setup script failed: ${stderrChunks.join('')}`));
    });
  });
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const readIncludedPaths = async (projectDirectory: string): Promise<readonly string[]> => {
  const includeFilePath = path.join(projectDirectory, '.worktreeinclude');
  try {
    const content = await readFile(includeFilePath, 'utf8');
    const result = parseWorktreeInclude(content);
    if (result.kind === 'error') {
      throw new Error(`.worktreeinclude:${result.line}: ${result.reason}: ${result.path}`);
    }
    return result.paths;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const copyFileIfMissing = async (sourcePath: string, destinationPath: string): Promise<void> => {
  if (await fileExists(destinationPath)) {
    return;
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
};

const copyDirectoryIfMissing = async (
  sourceDirectory: string,
  destinationDirectory: string,
): Promise<void> => {
  if (await fileExists(destinationDirectory)) {
    const destinationStat = await lstat(destinationDirectory);
    if (!destinationStat.isDirectory()) {
      return;
    }
  } else {
    await mkdir(destinationDirectory, { recursive: true });
  }

  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    await copyIncludedPath(
      path.join(sourceDirectory, entry.name),
      path.join(destinationDirectory, entry.name),
    );
  }
};

const copyIncludedPath = async (sourcePath: string, destinationPath: string): Promise<void> => {
  const sourceStat = await lstat(sourcePath);
  if (sourceStat.isFile()) {
    await copyFileIfMissing(sourcePath, destinationPath);
    return;
  }
  if (sourceStat.isDirectory()) {
    await copyDirectoryIfMissing(sourcePath, destinationPath);
    return;
  }

  throw new Error(`.worktreeinclude supports files and directories only: ${sourcePath}`);
};

export const createWorktreeForProject = async (
  project: Project,
  request: CreateProjectWorktreeRequest,
  gitRunner: GitRunner = runGit,
  setupScriptRunner: SetupScriptRunner = runSetupScript,
): Promise<ProjectWorktree> => {
  const nameResult = validateWorktreeName(request.name);
  if (nameResult.kind === 'error') {
    throw new Error(nameResult.reason);
  }

  const branchNameResult = validateGitRefArgument(
    request.branchName ?? `ra/${nameResult.name}`,
    'branchName',
  );
  if (branchNameResult.kind === 'error') {
    throw new Error(branchNameResult.reason);
  }
  const baseRefResult = validateGitRefArgument(request.baseRef ?? 'HEAD', 'baseRef');
  if (baseRefResult.kind === 'error') {
    throw new Error(baseRefResult.reason);
  }

  const includePaths = await readIncludedPaths(project.workingDirectory);
  const worktreesDirectory = path.join(project.workingDirectory, '.worktrees');
  const worktreeDirectory = path.join(worktreesDirectory, nameResult.name);
  if (await fileExists(worktreeDirectory)) {
    throw new Error(`worktree already exists: ${nameResult.name}`);
  }

  await mkdir(worktreesDirectory, { recursive: true });
  await gitRunner(project.workingDirectory, [
    'worktree',
    'add',
    '-b',
    branchNameResult.value,
    worktreeDirectory,
    baseRefResult.value,
  ]);

  for (const includePath of includePaths) {
    await copyIncludedPath(
      path.join(project.workingDirectory, includePath),
      path.join(worktreeDirectory, includePath),
    );
  }

  await setupScriptRunner(worktreeDirectory, project.worktreeSetupScript ?? '');

  return parse(projectWorktreeSchema, {
    projectId: project.id,
    name: nameResult.name,
    path: worktreeDirectory,
    branchName: branchNameResult.value,
    baseRef: baseRefResult.value,
    createdAt: new Date().toISOString(),
  });
};

export const createProjectWorktree = async (
  projectId: string,
  request: CreateProjectWorktreeRequest,
): Promise<ProjectWorktree> => {
  const project = await getProject(projectId);
  return createWorktreeForProject(project, request);
};
