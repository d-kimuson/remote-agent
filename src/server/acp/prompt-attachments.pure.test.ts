import { describe, expect, test } from 'vitest';

import {
  acpAiProviderAttachmentCapabilities,
  buildAttachmentPromptPlan,
  buildPromptWithAttachments,
} from './prompt-attachments.pure.ts';

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

  test('plans image delivery through adapter image blocks while preserving text fallback', () => {
    const result = buildAttachmentPromptPlan({
      attachments: [
        {
          attachmentId: 'attachment-image',
          mediaType: 'image/png',
          name: 'screen.png',
          sizeInBytes: 128,
          storedPath: '/tmp/remote-agent-attachments/attachment-image-screen.png',
        },
      ],
      capabilities: acpAiProviderAttachmentCapabilities,
      prompt: 'inspect this',
    });

    expect(result.promptText).toContain('Attached files:');
    expect(result.promptText).toContain(
      '/tmp/remote-agent-attachments/attachment-image-screen.png',
    );
    expect(result.deliveries).toEqual([
      {
        attachmentId: 'attachment-image',
        kind: 'image',
        mediaType: 'image/png',
        name: 'screen.png',
        sizeInBytes: 128,
        storedPath: '/tmp/remote-agent-attachments/attachment-image-screen.png',
      },
    ]);
  });

  test('falls back to structured metadata when adapter cannot send resource links', () => {
    const result = buildAttachmentPromptPlan({
      attachments: [
        {
          attachmentId: 'attachment-text',
          mediaType: 'text/plain',
          name: 'notes.txt',
          sizeInBytes: 12,
          storedPath: '/tmp/remote-agent-attachments/attachment-text-notes.txt',
        },
      ],
      capabilities: acpAiProviderAttachmentCapabilities,
      prompt: 'review this',
    });

    expect(result.deliveries[0]?.kind).toBe('text_fallback');
    expect(result.promptText).toContain('notes.txt');
  });
});
