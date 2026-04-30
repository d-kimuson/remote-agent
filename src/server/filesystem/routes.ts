import { Hono } from 'hono';
import { describeRoute, validator as vValidator } from 'hono-openapi';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { object, optional, parse, pipe, string, transform, trim } from 'valibot';

import {
  directoryListingResponseSchema,
  fileCompletionResponseSchema,
  filesystemTreeResponseSchema,
  type DirectoryEntry,
  type FileCompletionEntry,
  type FilesystemEntry,
} from '../../shared/acp.ts';
import { errorResponseSchema, jsonResponse, validationErrorHook } from '../hono-utils.ts';
import { getProject } from '../projects/project-store.ts';

const filesystemTreeQuerySchema = object({
  root: optional(pipe(string(), trim())),
});

const directoryListingQuerySchema = object({
  currentPath: optional(pipe(string(), trim())),
  showHidden: optional(
    pipe(
      string(),
      transform((value) => value === 'true'),
    ),
  ),
});

const fileCompletionQuerySchema = object({
  projectId: pipe(string(), trim()),
  basePath: optional(pipe(string(), trim())),
});

const ignoredDirectoryNames = new Set(['.git', 'node_modules', 'dist', '.next', '.turbo']);

const normalizedRelativePath = (relativePath: string): string => {
  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized === '/' || normalized === '.') {
    return '';
  }
  return normalized.startsWith('/') ? normalized.slice(1) : normalized;
};

const isInsideOrEqual = (rootPath: string, targetPath: string): boolean => {
  const relative = path.relative(rootPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const readDirectoryTree = async (rootPath: string): Promise<FilesystemEntry> => {
  const resolvedRoot = path.resolve(rootPath);
  const directoryStat = await stat(resolvedRoot);
  if (!directoryStat.isDirectory()) {
    throw new Error('root must be a directory');
  }

  const entries = await readdir(resolvedRoot, { withFileTypes: true });
  const children = entries
    .filter((entry) => !entry.name.startsWith('.') && !ignoredDirectoryNames.has(entry.name))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, 200)
    .map(
      (entry) =>
        ({
          name: entry.name,
          path: path.join(resolvedRoot, entry.name),
          kind: entry.isDirectory() ? 'directory' : 'file',
        }) as const,
    );

  return {
    name: path.basename(resolvedRoot) || resolvedRoot,
    path: resolvedRoot,
    kind: 'directory',
    children,
  };
};

const readDirectoryListing = async (
  currentPath: string | undefined,
  showHidden: boolean,
): Promise<{ entries: readonly DirectoryEntry[]; currentPath: string }> => {
  const targetPath = path.resolve(
    currentPath !== undefined && currentPath !== '' ? currentPath : homedir(),
  );
  const directoryStat = await stat(targetPath);
  if (!directoryStat.isDirectory()) {
    throw new Error('currentPath must be a directory');
  }

  const filenames = await readdir(targetPath, { withFileTypes: true });

  const entries: DirectoryEntry[] = [];

  const parentPath = path.dirname(targetPath);
  if (parentPath !== targetPath) {
    entries.push({ name: '..', type: 'directory', path: parentPath });
  }

  for (const entry of filenames) {
    if (!showHidden && entry.name.startsWith('.')) {
      continue;
    }
    if (!entry.isDirectory() && !entry.isFile()) {
      continue;
    }
    entries.push({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: path.join(targetPath, entry.name),
    });
  }

  entries.sort((left, right) => {
    if (left.name === '..') return -1;
    if (right.name === '..') return 1;
    if (left.type !== right.type) {
      return left.type === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  return { entries, currentPath: targetPath };
};

const readFileCompletion = async ({
  basePath,
  projectId,
}: {
  readonly projectId: string;
  readonly basePath?: string | undefined;
}): Promise<{
  readonly entries: readonly FileCompletionEntry[];
  readonly basePath: string;
  readonly projectPath: string;
}> => {
  const project = await getProject(projectId);
  const projectPath = path.resolve(project.workingDirectory);
  const normalizedBasePath = normalizedRelativePath(basePath ?? '');
  const targetPath = path.resolve(projectPath, normalizedBasePath);
  if (!isInsideOrEqual(projectPath, targetPath)) {
    throw new Error('basePath must stay inside the project directory');
  }

  const directoryStat = await stat(targetPath);
  if (!directoryStat.isDirectory()) {
    return { entries: [], basePath: normalizedBasePath, projectPath };
  }

  const filenames = await readdir(targetPath, { withFileTypes: true });
  const entries = filenames
    .filter((entry) => !entry.name.startsWith('.'))
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .filter((entry) => !(entry.isDirectory() && ignoredDirectoryNames.has(entry.name)))
    .map((entry): FileCompletionEntry => {
      const entryPath =
        normalizedBasePath.length === 0
          ? entry.name
          : path.join(normalizedBasePath, entry.name).replaceAll('\\', '/');
      return {
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory() ? 'directory' : 'file',
      };
    })
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, 200);

  return { entries, basePath: normalizedBasePath, projectPath };
};

export const filesystemRoutes = new Hono()
  .get(
    '/tree',
    describeRoute({
      summary: 'Get filesystem tree',
      responses: {
        200: jsonResponse('Filesystem tree', filesystemTreeResponseSchema),
        400: jsonResponse('Directory read error', errorResponseSchema),
      },
    }),
    vValidator('query', filesystemTreeQuerySchema, validationErrorHook),
    async (c) => {
      try {
        const rootPath = c.req.valid('query').root ?? process.cwd();
        const response = parse(filesystemTreeResponseSchema, {
          root: await readDirectoryTree(rootPath),
        });
        return c.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to read directory tree';
        return c.json({ error: message }, 400);
      }
    },
  )
  .get(
    '/directory-listing',
    describeRoute({
      summary: 'List directory entries for navigation',
      responses: {
        200: jsonResponse('Directory listing', directoryListingResponseSchema),
        400: jsonResponse('Directory read error', errorResponseSchema),
      },
    }),
    vValidator('query', directoryListingQuerySchema, validationErrorHook),
    async (c) => {
      try {
        const { currentPath, showHidden } = c.req.valid('query');
        const result = await readDirectoryListing(currentPath, showHidden ?? false);
        const response = parse(directoryListingResponseSchema, {
          entries: result.entries,
          currentPath: result.currentPath,
        });
        return c.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to list directory';
        return c.json({ error: message }, 400);
      }
    },
  )
  .get(
    '/file-completion',
    describeRoute({
      summary: 'List project files for prompt completion',
      responses: {
        200: jsonResponse('File completion entries', fileCompletionResponseSchema),
        400: jsonResponse('File completion error', errorResponseSchema),
      },
    }),
    vValidator('query', fileCompletionQuerySchema, validationErrorHook),
    async (c) => {
      try {
        const response = parse(
          fileCompletionResponseSchema,
          await readFileCompletion(c.req.valid('query')),
        );
        return c.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to list project files';
        return c.json({ error: message }, 400);
      }
    },
  );
