import { describe, expect, test } from 'vitest';

import { buildPromptWithAttachments } from './prompt-attachments.pure.ts';

describe('buildPromptWithAttachments', () => {
  test('returns original prompt when attachments are absent', () => {
    expect(buildPromptWithAttachments({ attachments: [], prompt: 'hello' })).toBe('hello');
  });

  test('appends uploaded attachment metadata and stored paths', () => {
    const result = buildPromptWithAttachments({
      attachments: [
        {
          attachmentId: 'attachment-1',
          mediaType: 'text/plain',
          name: 'notes.txt',
          sizeInBytes: 12,
          storedPath: '/tmp/remote-agent-attachments/attachment-1-notes.txt',
        },
      ],
      prompt: 'review this file',
    });

    expect(result).toContain('review this file');
    expect(result).toContain('Attached files:');
    expect(result).toContain('notes.txt');
    expect(result).toContain('text/plain');
    expect(result).toContain('/tmp/remote-agent-attachments/attachment-1-notes.txt');
  });
});
