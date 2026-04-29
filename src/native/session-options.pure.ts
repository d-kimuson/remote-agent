import type {
  AgentPreset,
  AgentProviderStatus,
  CreateProjectWorktreeRequest,
  CreateRoutineRequest,
  ModeOption,
  ModelOption,
  ProjectModePreference,
  ProjectModelPreference,
  Routine,
  RoutineKind,
  UpdateRoutineRequest,
} from '../shared/acp.ts';

type SelectableOption = ModelOption | ModeOption;

export const enabledProviderPresets = (
  providers: readonly AgentProviderStatus[],
): readonly AgentPreset[] =>
  providers.filter((entry) => entry.enabled).map((entry) => entry.preset);

export const defaultPresetId = (presets: readonly AgentPreset[]): string | null =>
  presets.find((preset) => preset.id === 'codex')?.id ?? presets[0]?.id ?? null;

export const optionDisplayName = (option: SelectableOption): string =>
  option.name.length > 0 ? option.name : option.id;

export const resolveSelectableOptionId = ({
  currentId,
  explicitId,
  preferredIds = [],
  options,
}: {
  readonly currentId: string | null | undefined;
  readonly explicitId: string | null | undefined;
  readonly preferredIds?: readonly string[];
  readonly options: readonly SelectableOption[];
}): string | null => {
  if (
    explicitId !== null &&
    explicitId !== undefined &&
    options.some((option) => option.id === explicitId)
  ) {
    return explicitId;
  }
  if (
    currentId !== null &&
    currentId !== undefined &&
    options.some((option) => option.id === currentId)
  ) {
    return currentId;
  }
  const preferredId = preferredIds.find((id) => options.some((option) => option.id === id));
  if (preferredId !== undefined) {
    return preferredId;
  }
  return options[0]?.id ?? null;
};

export const preferredModelIds = (
  preferences: readonly ProjectModelPreference[],
  presetId: string | null,
): readonly string[] => {
  if (presetId === null) {
    return [];
  }
  const presetPreferences = preferences.filter((entry) => entry.presetId === presetId);
  const lastUsed = presetPreferences
    .filter((entry) => entry.lastUsedAt !== null && entry.lastUsedAt !== undefined)
    .sort((left, right) => (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? ''))
    .map((entry) => entry.modelId);
  const favorites = presetPreferences
    .filter((entry) => entry.isFavorite)
    .map((entry) => entry.modelId);
  return [...lastUsed, ...favorites];
};

export const preferredModeIds = (
  preferences: readonly ProjectModePreference[],
  presetId: string | null,
): readonly string[] => {
  if (presetId === null) {
    return [];
  }
  return preferences
    .filter(
      (entry) =>
        entry.presetId === presetId && entry.lastUsedAt !== null && entry.lastUsedAt !== undefined,
    )
    .sort((left, right) => (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? ''))
    .map((entry) => entry.modeId);
};

export const worktreeRequestFromDraft = ({
  baseRef,
  branchName,
  name,
}: {
  readonly name: string;
  readonly branchName: string;
  readonly baseRef: string;
}): CreateProjectWorktreeRequest | null => {
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return null;
  }
  const trimmedBranchName = branchName.trim();
  const trimmedBaseRef = baseRef.trim();
  return {
    name: trimmedName,
    ...(trimmedBranchName.length > 0 ? { branchName: trimmedBranchName } : {}),
    ...(trimmedBaseRef.length > 0 ? { baseRef: trimmedBaseRef } : {}),
  };
};

export const routineRequestFromDraft = ({
  cwd,
  enabled,
  kind,
  modelId,
  modeId,
  name,
  presetId,
  projectId,
  prompt,
  scheduleValue,
}: {
  readonly name: string;
  readonly enabled: boolean;
  readonly kind: RoutineKind;
  readonly scheduleValue: string;
  readonly projectId: string | null;
  readonly presetId: string;
  readonly cwd: string | null;
  readonly modelId: string | null;
  readonly modeId: string | null;
  readonly prompt: string;
}): CreateRoutineRequest | null => {
  const trimmedName = name.trim();
  const trimmedSchedule = scheduleValue.trim();
  const trimmedPrompt = prompt.trim();
  const trimmedPresetId = presetId.trim();
  if (
    trimmedName.length === 0 ||
    trimmedSchedule.length === 0 ||
    trimmedPrompt.length === 0 ||
    trimmedPresetId.length === 0
  ) {
    return null;
  }

  return {
    name: trimmedName,
    enabled,
    kind,
    config: kind === 'cron' ? { cronExpression: trimmedSchedule } : { runAt: trimmedSchedule },
    sendConfig: {
      projectId,
      presetId: trimmedPresetId,
      cwd,
      modelId,
      modeId,
      prompt: trimmedPrompt,
    },
  };
};

export const routineUpdateFromDraft = (
  draft: Parameters<typeof routineRequestFromDraft>[0],
): UpdateRoutineRequest | null => {
  const request = routineRequestFromDraft(draft);
  if (request === null) {
    return null;
  }
  return request;
};

export const scheduleValueFromRoutine = (routine: Routine): string =>
  routine.kind === 'cron' ? routine.config.cronExpression : routine.config.runAt;
