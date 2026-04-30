import { describe, expect, test } from 'vitest';

import {
  buildFileDiffFromStrings,
  buildFileDiffFromUnifiedDiff,
  parseUnifiedDiffHunks,
} from './diff-viewer.pure.ts';

describe('parseUnifiedDiffHunks', () => {
  test('unified diff を行番号付き hunk に変換する', () => {
    const hunks = parseUnifiedDiffHunks(
      '@@ -26 +26,3 @@\n ## Usage\n+\n+Temporary debug edit marker.\n',
    );

    expect(hunks).toEqual([
      {
        oldStart: 26,
        newStart: 26,
        lines: [
          { type: 'hunk', content: '@@ -26 +26,3 @@' },
          { type: 'unchanged', oldLineNumber: 26, newLineNumber: 26, content: '## Usage' },
          { type: 'added', newLineNumber: 27, content: '' },
          { type: 'added', newLineNumber: 28, content: 'Temporary debug edit marker.' },
        ],
      },
    ]);
  });
});

describe('buildFileDiffFromStrings', () => {
  test('old_string/new_string から FileDiff を作る', () => {
    expect(
      buildFileDiffFromStrings({
        filename: 'README.md',
        oldString: '2. Open the web UI.',
        newString: '2. Open the web UI in your browser.',
      }),
    ).toEqual({
      filename: 'README.md',
      isNew: false,
      isDeleted: false,
      isRenamed: false,
      isBinary: false,
      hunks: [
        {
          oldStart: 1,
          newStart: 1,
          lines: [
            { type: 'hunk', content: '@@ -1,1 +1,1 @@' },
            { type: 'deleted', oldLineNumber: 1, content: '2. Open the web UI.' },
            { type: 'added', newLineNumber: 1, content: '2. Open the web UI in your browser.' },
          ],
        },
      ],
      linesAdded: 1,
      linesDeleted: 1,
    });
  });
});

describe('buildFileDiffFromUnifiedDiff', () => {
  test('change type と行数を FileDiff に反映する', () => {
    const fileDiff = buildFileDiffFromUnifiedDiff({
      filename: 'docs/tmp/README-v2.md',
      unifiedDiff: '@@ -26 +26,3 @@\n ## Usage\n+\n+Temporary debug edit marker.\n',
      changeType: 'update',
    });

    expect(fileDiff.linesAdded).toBe(2);
    expect(fileDiff.linesDeleted).toBe(0);
    expect(fileDiff.isNew).toBe(false);
    expect(fileDiff.isDeleted).toBe(false);
    expect(fileDiff.isRenamed).toBe(false);
  });
});
