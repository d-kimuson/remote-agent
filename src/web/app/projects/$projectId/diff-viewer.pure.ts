export type DiffLine = {
  readonly type: 'added' | 'deleted' | 'unchanged' | 'hunk' | 'context';
  readonly oldLineNumber?: number;
  readonly newLineNumber?: number;
  readonly content: string;
};

export type DiffHunk = {
  readonly oldStart: number;
  readonly newStart: number;
  readonly lines: readonly DiffLine[];
};

export type FileDiff = {
  readonly filename: string;
  readonly oldFilename?: string;
  readonly isNew: boolean;
  readonly isDeleted: boolean;
  readonly isRenamed: boolean;
  readonly isBinary: boolean;
  readonly hunks: readonly DiffHunk[];
  readonly linesAdded: number;
  readonly linesDeleted: number;
};

export type TextEdit = {
  readonly oldText: string;
  readonly newText: string;
};

type MutableHunk = {
  readonly oldStart: number;
  readonly newStart: number;
  readonly lines: DiffLine[];
};

const hunkHeaderPattern = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@.*$/;

const countChangedLines = (
  hunks: readonly DiffHunk[],
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

const hunkFromMutable = (hunk: MutableHunk): DiffHunk => ({
  oldStart: hunk.oldStart,
  newStart: hunk.newStart,
  lines: hunk.lines,
});

export const parseUnifiedDiffHunks = (unifiedDiff: string): readonly DiffHunk[] => {
  const hunks: DiffHunk[] = [];
  let current: MutableHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of unifiedDiff.split('\n')) {
    const header = rawLine.match(hunkHeaderPattern);
    if (header !== null) {
      if (current !== null) {
        hunks.push(hunkFromMutable(current));
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
    hunks.push(hunkFromMutable(current));
  }

  return hunks;
};

export const buildFileDiffFromUnifiedDiff = ({
  filename,
  oldFilename,
  unifiedDiff,
  changeType,
}: {
  readonly filename: string;
  readonly oldFilename?: string;
  readonly unifiedDiff: string;
  readonly changeType?: string;
}): FileDiff => {
  const hunks = parseUnifiedDiffHunks(unifiedDiff);
  const { linesAdded, linesDeleted } = countChangedLines(hunks);
  return {
    filename,
    oldFilename,
    isNew: changeType === 'add' || changeType === 'create',
    isDeleted: changeType === 'delete' || changeType === 'remove',
    isRenamed: changeType === 'rename' || oldFilename !== undefined,
    isBinary: false,
    hunks,
    linesAdded,
    linesDeleted,
  };
};

export const buildFileDiffFromStrings = ({
  filename,
  oldString,
  newString,
}: {
  readonly filename: string;
  readonly oldString: string;
  readonly newString: string;
}): FileDiff => {
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');
  const lines: DiffLine[] = [
    { type: 'hunk', content: `@@ -1,${oldLines.length} +1,${newLines.length} @@` },
    ...oldLines.map(
      (line, index): DiffLine => ({
        type: 'deleted',
        oldLineNumber: index + 1,
        content: line,
      }),
    ),
    ...newLines.map(
      (line, index): DiffLine => ({
        type: 'added',
        newLineNumber: index + 1,
        content: line,
      }),
    ),
  ];

  return {
    filename,
    isNew: false,
    isDeleted: false,
    isRenamed: false,
    isBinary: false,
    hunks: [{ oldStart: 1, newStart: 1, lines }],
    linesAdded: newLines.length,
    linesDeleted: oldLines.length,
  };
};

export const buildFileDiffFromTextEdits = ({
  filename,
  edits,
}: {
  readonly filename: string;
  readonly edits: readonly TextEdit[];
}): FileDiff => {
  const hunks = edits.map((edit): DiffHunk => {
    const oldLines = edit.oldText.split('\n');
    const newLines = edit.newText.split('\n');
    return {
      oldStart: 1,
      newStart: 1,
      lines: [
        { type: 'hunk', content: `@@ -1,${oldLines.length} +1,${newLines.length} @@` },
        ...oldLines.map(
          (line, index): DiffLine => ({
            type: 'deleted',
            oldLineNumber: index + 1,
            content: line,
          }),
        ),
        ...newLines.map(
          (line, index): DiffLine => ({
            type: 'added',
            newLineNumber: index + 1,
            content: line,
          }),
        ),
      ],
    };
  });
  const { linesAdded, linesDeleted } = countChangedLines(hunks);

  return {
    filename,
    isNew: false,
    isDeleted: false,
    isRenamed: false,
    isBinary: false,
    hunks,
    linesAdded,
    linesDeleted,
  };
};
