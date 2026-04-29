export type DraftSendAvailabilityInput = {
  readonly promptText: string;
  readonly isSending: boolean;
  readonly shouldUseDraftSession: boolean;
  readonly activePresetId: string;
  readonly useDraftWorktree: boolean;
  readonly worktreeName: string;
};

export type PreparedDraftSessionInput = {
  readonly shouldUseDraftSession: boolean;
  readonly useDraftWorktree: boolean;
};

export const normalizeDraftWorktreeName = (value: string): string => value.trim();

export const draftWorktreeNameError = (value: string): string | null => {
  const normalized = normalizeDraftWorktreeName(value);
  if (normalized.length === 0) {
    return 'Worktree name is required.';
  }
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('..\\') ||
    normalized.includes('/..') ||
    normalized.includes('\\..')
  ) {
    return 'Worktree name cannot contain path traversal.';
  }
  if (normalized.startsWith('/') || normalized.includes('/') || normalized.includes('\\')) {
    return 'Worktree name cannot contain path separators.';
  }
  return null;
};

export const shouldUsePreparedDraftSession = ({
  shouldUseDraftSession,
  useDraftWorktree,
}: PreparedDraftSessionInput): boolean => shouldUseDraftSession && !useDraftWorktree;

export const canSendWithDraftWorktreeState = ({
  activePresetId,
  isSending,
  promptText,
  shouldUseDraftSession,
  useDraftWorktree,
  worktreeName,
}: DraftSendAvailabilityInput): boolean => {
  if (promptText.length === 0 || isSending) {
    return false;
  }

  if (!shouldUseDraftSession) {
    return true;
  }

  if (activePresetId.length === 0) {
    return false;
  }

  if (!useDraftWorktree) {
    return true;
  }

  return draftWorktreeNameError(worktreeName) === null;
};
