import type { UploadedAttachment } from '../../../../shared/acp.ts';

export type QueuedFollowUpPrompt = {
  readonly id: string;
  readonly prompt: string;
  readonly attachments: readonly UploadedAttachment[];
};

/**
 * Cursor ACP has no mid-turn steer. While a turn is busy, follow-ups are queued
 * client-side and sent as the next `session/prompt` after the session is idle.
 */
export const shouldQueueFollowUpPrompt = ({
  hasSessionId,
  isTurnBusy,
  shouldUseDraftSession,
}: {
  readonly hasSessionId: boolean;
  readonly isTurnBusy: boolean;
  readonly shouldUseDraftSession: boolean;
}): boolean => !shouldUseDraftSession && hasSessionId && isTurnBusy;

export const enqueueFollowUpPrompt = (
  queue: readonly QueuedFollowUpPrompt[],
  item: QueuedFollowUpPrompt,
): readonly QueuedFollowUpPrompt[] => [...queue, item];

export const takeNextFollowUpPrompt = (
  queue: readonly QueuedFollowUpPrompt[],
): {
  readonly next: QueuedFollowUpPrompt | null;
  readonly rest: readonly QueuedFollowUpPrompt[];
} => {
  const [next, ...rest] = queue;
  if (next === undefined) {
    return { next: null, rest: [] };
  }
  return { next, rest };
};

export const removeFollowUpPrompt = (
  queue: readonly QueuedFollowUpPrompt[],
  id: string,
): readonly QueuedFollowUpPrompt[] => queue.filter((item) => item.id !== id);

/** Move the matching item to the front so it is flushed next after cancel/idle. */
export const promoteFollowUpPrompt = (
  queue: readonly QueuedFollowUpPrompt[],
  id: string,
): readonly QueuedFollowUpPrompt[] => {
  const index = queue.findIndex((item) => item.id === id);
  if (index <= 0) {
    return queue;
  }
  const item = queue[index];
  if (item === undefined) {
    return queue;
  }
  return [item, ...queue.slice(0, index), ...queue.slice(index + 1)];
};

/**
 * While a turn is in flight the editor stays editable. Restoring the failed
 * prompt must not clobber a draft the user already typed or queued.
 */
export const shouldRestorePromptAfterSendFailure = ({
  editorText,
  fromQueue,
  hasQueuedFollowUps,
  sameTranscriptKey,
}: {
  readonly editorText: string;
  readonly fromQueue: boolean;
  readonly hasQueuedFollowUps: boolean;
  readonly sameTranscriptKey: boolean;
}): boolean =>
  !fromQueue && sameTranscriptKey && !hasQueuedFollowUps && editorText.trim().length === 0;
