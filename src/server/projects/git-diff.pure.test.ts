import { describe, expect, test } from 'vitest';

import {
  createUntrackedFileDiff,
  parseGitDiffOutput,
  summarizeGitFileDiffs,
} from './git-diff.pure.ts';

describe('parseGitDiffOutput', () => {
  test('parses modified file hunks with line numbers', () => {
    const files = parseGitDiffOutput(
      [
        'diff --git a/src/app.ts b/src/app.ts',
        'index 1111111..2222222 100644',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -1,3 +1,3 @@',
        ' const a = 1',
        '-const b = 2',
        '+const b = 3',
        ' const c = 4',
      ].join('\n'),
    );

    expect(files).toEqual([
      {
        filename: 'src/app.ts',
        oldFilename: undefined,
        isNew: false,
        isDeleted: false,
        isRenamed: false,
        isBinary: false,
        linesAdded: 1,
        linesDeleted: 1,
        hunks: [
          {
            oldStart: 1,
            newStart: 1,
            lines: [
              { type: 'hunk', content: '@@ -1,3 +1,3 @@' },
              { type: 'unchanged', oldLineNumber: 1, newLineNumber: 1, content: 'const a = 1' },
              { type: 'deleted', oldLineNumber: 2, content: 'const b = 2' },
              { type: 'added', newLineNumber: 2, content: 'const b = 3' },
              { type: 'unchanged', oldLineNumber: 3, newLineNumber: 3, content: 'const c = 4' },
            ],
          },
        ],
      },
    ]);
  });

  test('parses renamed binary files', () => {
    const files = parseGitDiffOutput(
      [
        'diff --git a/old.png b/new.png',
        'similarity index 100%',
        'rename from old.png',
        'rename to new.png',
        'Binary files a/old.png and b/new.png differ',
      ].join('\n'),
    );

    expect(files).toEqual([
      {
        filename: 'new.png',
        oldFilename: 'old.png',
        isNew: false,
        isDeleted: false,
        isRenamed: true,
        isBinary: true,
        hunks: [],
        linesAdded: 0,
        linesDeleted: 0,
      },
    ]);
  });
});

describe('summarizeGitFileDiffs', () => {
  test('sums file and line counts', () => {
    const files = [
      createUntrackedFileDiff('a.txt', 'one\ntwo'),
      createUntrackedFileDiff('b.txt', 'three'),
    ];

    expect(summarizeGitFileDiffs(files)).toEqual({
      totalFiles: 2,
      totalAdditions: 3,
      totalDeletions: 0,
    });
  });
});
