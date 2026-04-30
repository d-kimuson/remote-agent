import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parse } from 'valibot';

import {
  gitRevisionsRequestSchema,
  gitDiffResponseSchema,
  gitRevisionsResponseSchema,
  type GitDiffRequest,
  type GitDiffResponse,
  type GitRevisionsRequest,
  type GitRevisionRef,
  type GitRevisionsResponse,
} from '../../shared/acp.ts';
import { resolveProjectGitCwd } from './git-cwd.pure.ts';
import {
  createUntrackedFileDiff,
  parseGitDiffOutput,
  summarizeGitFileDiffs,
} from './git-diff.pure.ts';
import { getProject } from './project-store.ts';

type GitOutputRunner = (cwd: string, args: readonly string[]) => Promise<string>;

const runGitOutput: GitOutputRunner = async (cwd, args) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn('git', args, { cwd, shell: false, stdio: 'pipe' });
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk.toString('utf8'));
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdoutChunks.join(''));
        return;
      }
      reject(new Error(`git ${args.join(' ')} failed: ${stderrChunks.join('')}`));
    });
  });

const validateGitRefArgument = (value: string): string => {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0 || trimmedValue.startsWith('-') || trimmedValue.includes('\0')) {
    throw new Error(`Invalid git ref: ${value}`);
  }
  return trimmedValue;
};

const extractDiffRef = (refText: string): string | undefined => {
  if (refText === 'working') {
    return undefined;
  }
  if (refText === 'HEAD') {
    return 'HEAD';
  }

  const separatorIndex = refText.indexOf(':');
  if (separatorIndex === -1) {
    throw new Error(`Invalid diff ref: ${refText}`);
  }

  const group = refText.slice(0, separatorIndex);
  const ref = refText.slice(separatorIndex + 1);
  if (group !== 'branch' && group !== 'commit') {
    throw new Error(`Invalid diff ref: ${refText}`);
  }
  return validateGitRefArgument(ref);
};

const parseCommitRefs = (output: string): readonly GitRevisionRef[] =>
  output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line): readonly GitRevisionRef[] => {
      const [sha, subject] = line.split('\t');
      if (sha === undefined || sha.length === 0) {
        return [];
      }
      const label = subject === undefined || subject.length === 0 ? sha.slice(0, 7) : subject;
      return [
        {
          name: `commit:${sha}`,
          type: 'commit',
          displayName: `${label.slice(0, 50)}${label.length > 50 ? '...' : ''}`,
          sha,
        },
      ];
    });

const maybeGitOutput = async (cwd: string, args: readonly string[]): Promise<string | null> => {
  try {
    return await runGitOutput(cwd, args);
  } catch {
    return null;
  }
};

const untrackedFilePaths = async (cwd: string): Promise<readonly string[]> => {
  const output = await maybeGitOutput(cwd, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (output === null || output.length === 0) {
    return [];
  }
  return output.split('\0').filter((path) => path.length > 0);
};

const untrackedFileDiffs = async (cwd: string) => {
  const files = await untrackedFilePaths(cwd);
  const diffs = await Promise.all(
    files.map(async (file) => {
      try {
        return createUntrackedFileDiff(file, await readFile(`${cwd}/${file}`, 'utf8'));
      } catch {
        return null;
      }
    }),
  );
  return diffs.flatMap((diff) => (diff === null ? [] : [diff]));
};

const resolveGitOperationCwd = async (
  projectId: string,
  requestedCwd?: string | null,
): Promise<string> => {
  const project = await getProject(projectId);
  const repositoryDirectory =
    (await maybeGitOutput(project.workingDirectory, ['rev-parse', '--show-toplevel']))?.trim() ??
    project.workingDirectory;
  return resolveProjectGitCwd({
    projectDirectory: project.workingDirectory,
    repositoryDirectory,
    requestedCwd,
  });
};

export const getGitRevisions = async (
  projectId: string,
  request: GitRevisionsRequest = parse(gitRevisionsRequestSchema, {}),
): Promise<GitRevisionsResponse> => {
  const cwd = await resolveGitOperationCwd(projectId, request.cwd);
  const head = (await maybeGitOutput(cwd, ['rev-parse', 'HEAD']))?.trim();
  const currentBranch = (await maybeGitOutput(cwd, ['branch', '--show-current']))?.trim();
  const commitRefs = parseCommitRefs(
    (await maybeGitOutput(cwd, ['log', '--format=%H\t%s', '-n', '20'])) ?? '',
  );
  const refs: GitRevisionRef[] = [
    { name: 'working', type: 'working', displayName: 'Uncommitted changes' },
    {
      name: 'HEAD',
      type: 'head',
      displayName: 'HEAD',
      ...(head === undefined ? {} : { sha: head }),
    },
    ...(currentBranch === undefined || currentBranch.length === 0
      ? []
      : [
          {
            name: `branch:${currentBranch}`,
            type: 'branch' as const,
            displayName: `${currentBranch} (current)`,
            ...(head === undefined ? {} : { sha: head }),
          },
        ]),
    ...commitRefs,
  ];

  return parse(gitRevisionsResponseSchema, { refs });
};

export const getGitDiff = async (
  projectId: string,
  request: GitDiffRequest,
): Promise<GitDiffResponse> => {
  const cwd = await resolveGitOperationCwd(projectId, request.cwd);
  const fromRef = extractDiffRef(request.fromRef);
  const toRef = extractDiffRef(request.toRef);

  if (fromRef === undefined) {
    throw new Error('Compare from must be a branch or commit');
  }
  validateGitRefArgument(fromRef);
  if (toRef !== undefined) {
    validateGitRefArgument(toRef);
  }

  const diffArgs = toRef === undefined ? [fromRef] : [fromRef, toRef];
  const trackedDiff = parseGitDiffOutput(
    await runGitOutput(cwd, ['diff', '--unified=5', ...diffArgs, '--']),
  );
  const untrackedDiff = toRef === undefined ? await untrackedFileDiffs(cwd) : [];
  const files = [...trackedDiff, ...untrackedDiff];

  return parse(gitDiffResponseSchema, {
    files,
    summary: summarizeGitFileDiffs(files),
  });
};
