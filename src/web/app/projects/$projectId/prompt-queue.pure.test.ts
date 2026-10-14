import { describe, expect, test } from 'vitest';

import type { UploadedAttachment } from '../../../../shared/acp.ts';

import {
  enqueueFollowUpPrompt,
  promoteFollowUpPrompt,
  removeFollowUpPrompt,
  shouldQueueFollowUpPrompt,
  shouldRestorePromptAfterSendFailure,
  takeNextFollowUpPrompt,
  type QueuedFollowUpPrompt,
} from './prompt-queue.pure.ts';

const attachment = {
  attachmentId: 'att-1',
  name: 'a.txt',
  mediaType: 'text/plain',
  sizeInBytes: 1,
} satisfies UploadedAttachment;

const item = (id: string, prompt: string): QueuedFollowUpPrompt => ({
  id,
  prompt,
  attachments: [attachment],
});

describe('shouldQueueFollowUpPrompt', () => {
  test('queues only for busy existing sessions', () => {
    expect(
      shouldQueueFollowUpPrompt({
        shouldUseDraftSession: false,
        hasSessionId: true,
        isTurnBusy: true,
      }),
    ).toBe(true);
    expect(
      shouldQueueFollowUpPrompt({
        shouldUseDraftSession: true,
        hasSessionId: false,
        isTurnBusy: true,
      }),
    ).toBe(false);
    expect(
      shouldQueueFollowUpPrompt({
        shouldUseDraftSession: false,
        hasSessionId: true,
        isTurnBusy: false,
      }),
    ).toBe(false);
  });
});

describe('follow-up prompt queue helpers', () => {
  test('enqueue appends', () => {
    expect(enqueueFollowUpPrompt([item('1', 'a')], item('2', 'b'))).toEqual([
      item('1', 'a'),
      item('2', 'b'),
    ]);
  });

  test('takeNext removes the head', () => {
    expect(takeNextFollowUpPrompt([item('1', 'a'), item('2', 'b')])).toEqual({
      next: item('1', 'a'),
      rest: [item('2', 'b')],
    });
    expect(takeNextFollowUpPrompt([])).toEqual({ next: null, rest: [] });
  });

  test('remove filters by id', () => {
    expect(removeFollowUpPrompt([item('1', 'a'), item('2', 'b')], '1')).toEqual([item('2', 'b')]);
  });

  test('promote moves an item to the front', () => {
    expect(promoteFollowUpPrompt([item('1', 'a'), item('2', 'b'), item('3', 'c')], '2')).toEqual([
      item('2', 'b'),
      item('1', 'a'),
      item('3', 'c'),
    ]);
    expect(promoteFollowUpPrompt([item('1', 'a'), item('2', 'b')], '1')).toEqual([
      item('1', 'a'),
      item('2', 'b'),
    ]);
  });
});

describe('shouldRestorePromptAfterSendFailure', () => {
  test('restores only for an untouched empty editor', () => {
    expect(
      shouldRestorePromptAfterSendFailure({
        fromQueue: false,
        sameTranscriptKey: true,
        hasQueuedFollowUps: false,
        editorText: '',
      }),
    ).toBe(true);
    expect(
      shouldRestorePromptAfterSendFailure({
        fromQueue: false,
        sameTranscriptKey: true,
        hasQueuedFollowUps: false,
        editorText: 'new draft',
      }),
    ).toBe(false);
    expect(
      shouldRestorePromptAfterSendFailure({
        fromQueue: false,
        sameTranscriptKey: true,
        hasQueuedFollowUps: true,
        editorText: '',
      }),
    ).toBe(false);
    expect(
      shouldRestorePromptAfterSendFailure({
        fromQueue: true,
        sameTranscriptKey: true,
        hasQueuedFollowUps: false,
        editorText: '',
      }),
    ).toBe(false);
  });
});
