import path from 'node:path';

export const isPathSameOrInside = ({
  childPath,
  parentPath,
}: {
  readonly childPath: string;
  readonly parentPath: string;
}): boolean => {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath.length === 0 ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
};

export const resolveProjectGitCwd = ({
  projectDirectory,
  repositoryDirectory,
  requestedCwd,
}: {
  readonly projectDirectory: string;
  readonly repositoryDirectory: string;
  readonly requestedCwd?: string | null;
}): string => {
  const resolvedProjectDirectory = path.resolve(projectDirectory);
  const trimmedCwd = requestedCwd?.trim();
  if (trimmedCwd === undefined || trimmedCwd.length === 0) {
    return resolvedProjectDirectory;
  }

  const resolvedCwd = path.resolve(trimmedCwd);
  const resolvedWorktreesDirectory = path.join(path.resolve(repositoryDirectory), '.worktrees');
  if (
    resolvedCwd === resolvedProjectDirectory ||
    isPathSameOrInside({ childPath: resolvedCwd, parentPath: resolvedWorktreesDirectory })
  ) {
    return resolvedCwd;
  }

  throw new Error(`cwd is outside project worktrees: ${trimmedCwd}`);
};
