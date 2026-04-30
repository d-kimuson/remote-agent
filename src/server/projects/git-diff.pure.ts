import type { GitFileDiff, GitDiffHunk, GitDiffLine } from '../../shared/acp.ts';

type MutableHunk = {
  readonly oldStart: number;
  readonly newStart: number;
  readonly lines: GitDiffLine[];
};

const hunkHeaderPattern = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@.*$/;

const countChangedLines = (
  hunks: readonly GitDiffHunk[],
): { readonly linesAdded: number; readonly linesDeleted: number } =>
  hunks.reduce(
    (acc, hunk) =>
      hunk.lines.reduce(
        (lineAcc, line) => ({
          linesAdded: lineAcc.linesAdded + (line.type === 'added' ? 1 : 0),
          linesDeleted: lineAcc.linesDeleted + (line.type === 'deleted' ? 1 : 0),
        }),
        acc,
      ),
    { linesAdded: 0, linesDeleted: 0 },
  );

const parseUnifiedDiffHunks = (unifiedDiff: string): GitDiffHunk[] => {
  const hunks: GitDiffHunk[] = [];
  let current: MutableHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of unifiedDiff.split('\n')) {
    const header = rawLine.match(hunkHeaderPattern);
    if (header !== null) {
      if (current !== null) {
        hunks.push(current);
      }
      const oldStart = Number.parseInt(header[1] ?? '0', 10);
      const newStart = Number.parseInt(header[2] ?? '0', 10);
      oldLine = oldStart;
      newLine = newStart;
      current = {
        oldStart,
        newStart,
        lines: [{ type: 'hunk', content: rawLine }],
      };
      continue;
    }

    if (current === null || rawLine.length === 0) {
      continue;
    }

    const prefix = rawLine[0];
    const content = rawLine.slice(1);
    if (prefix === '+') {
      current.lines.push({ type: 'added', newLineNumber: newLine, content });
      newLine += 1;
      continue;
    }
    if (prefix === '-') {
      current.lines.push({ type: 'deleted', oldLineNumber: oldLine, content });
      oldLine += 1;
      continue;
    }
    if (prefix === ' ') {
      current.lines.push({
        type: 'unchanged',
        oldLineNumber: oldLine,
        newLineNumber: newLine,
        content,
      });
      oldLine += 1;
      newLine += 1;
      continue;
    }
    current.lines.push({ type: 'context', content: rawLine });
  }

  if (current !== null) {
    hunks.push(current);
  }

  return hunks;
};

const unquoteGitPath = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
};

const stripDiffPathPrefix = (value: string): string => {
  const path = unquoteGitPath(value);
  return path.startsWith('a/') || path.startsWith('b/') ? path.slice(2) : path;
};

const firstPathAfter = (lines: readonly string[], prefix: string): string | null => {
  const line = lines.find((item) => item.startsWith(prefix));
  return line === undefined ? null : unquoteGitPath(line.slice(prefix.length));
};

const filePathFromSection = (lines: readonly string[]): string | null => {
  const renameTo = firstPathAfter(lines, 'rename to ');
  if (renameTo !== null) {
    return renameTo;
  }

  const plusLine = lines.find((line) => line.startsWith('+++ '));
  if (plusLine !== undefined && !plusLine.endsWith('/dev/null')) {
    return stripDiffPathPrefix(plusLine.slice(4));
  }

  const header = lines[0];
  const headerMatch = header?.match(/^a\/(.+?) b\/(.+)$/);
  return headerMatch?.[2] ?? null;
};

const oldPathFromSection = (lines: readonly string[]): string | undefined => {
  const renameFrom = firstPathAfter(lines, 'rename from ');
  if (renameFrom !== null) {
    return renameFrom;
  }

  const minusLine = lines.find((line) => line.startsWith('--- '));
  if (minusLine !== undefined && !minusLine.endsWith('/dev/null')) {
    return stripDiffPathPrefix(minusLine.slice(4));
  }

  return undefined;
};

const unifiedHunkText = (lines: readonly string[]): string => {
  const firstHunkIndex = lines.findIndex((line) => line.startsWith('@@ '));
  return firstHunkIndex === -1 ? '' : lines.slice(firstHunkIndex).join('\n');
};

const parseGitDiffSection = (section: string): GitFileDiff | null => {
  const lines = section.split('\n');
  const filename = filePathFromSection(lines);
  if (filename === null) {
    return null;
  }

  const oldFilename = oldPathFromSection(lines);
  const isNew = lines.some((line) => line.startsWith('new file mode')) || oldFilename === undefined;
  const isDeleted = lines.some((line) => line.startsWith('deleted file mode'));
  const isRenamed = lines.some((line) => line.startsWith('rename from '));
  const isBinary = lines.some((line) => line.startsWith('Binary files '));
  const hunks = isBinary ? [] : parseUnifiedDiffHunks(unifiedHunkText(lines));
  const counts = countChangedLines(hunks);

  return {
    filename,
    oldFilename: isRenamed ? oldFilename : undefined,
    isNew,
    isDeleted,
    isRenamed,
    isBinary,
    hunks,
    linesAdded: counts.linesAdded,
    linesDeleted: counts.linesDeleted,
  };
};

export const parseGitDiffOutput = (diffOutput: string): readonly GitFileDiff[] =>
  diffOutput
    .split(/^diff --git /m)
    .map((section) => section.trimEnd())
    .filter((section) => section.trim().length > 0)
    .flatMap((section) => {
      const file = parseGitDiffSection(section);
      return file === null ? [] : [file];
    });

export const summarizeGitFileDiffs = (files: readonly GitFileDiff[]) => ({
  totalFiles: files.length,
  totalAdditions: files.reduce((sum, file) => sum + file.linesAdded, 0),
  totalDeletions: files.reduce((sum, file) => sum + file.linesDeleted, 0),
});

export const createUntrackedFileDiff = (filename: string, content: string): GitFileDiff => {
  const lines = content.split('\n');
  const diffLines: GitDiffLine[] = [
    { type: 'hunk', content: `@@ -0,0 +1,${lines.length} @@` },
    ...lines.map(
      (line, index): GitDiffLine => ({
        type: 'added',
        newLineNumber: index + 1,
        content: line,
      }),
    ),
  ];

  return {
    filename,
    isNew: true,
    isDeleted: false,
    isRenamed: false,
    isBinary: false,
    hunks: [{ oldStart: 0, newStart: 1, lines: diffLines }],
    linesAdded: lines.length,
    linesDeleted: 0,
  };
};
