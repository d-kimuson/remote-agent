import type { AgentPreset, Routine } from '../../shared/acp.ts';

import { resolveProviderPreset } from '../acp/repositories/provider-catalog-store.ts';
import { createSession, sendPrompt } from '../acp/services/session-store.ts';
import {
  getProject,
  getProjectSettings,
  updateProjectModePreference,
  updateProjectModelPreference,
} from '../projects/project-store.ts';
import { createRoutineStore } from './routine-store.ts';

const runningRoutineIds = new Set<string>();

type RoutineRunnerDependencies = {
  readonly createAgentSession?: typeof createSession;
  readonly sendAgentPrompt?: typeof sendPrompt;
  readonly getProjectById?: typeof getProject;
  readonly getProjectSettingsById?: typeof getProjectSettings;
  readonly markProjectModeUsed?: typeof updateProjectModePreference;
  readonly markProjectModelUsed?: typeof updateProjectModelPreference;
  readonly resolveAgentPreset?: (presetId: string) => Promise<AgentPreset>;
};

const nonEmpty = (value: string | null | undefined): string | null =>
  value !== null && value !== undefined && value.length > 0 ? value : null;

const resolveInitialModelId = async ({
  getProjectSettingsById,
  modelId,
  presetId,
  projectId,
}: {
  readonly getProjectSettingsById: typeof getProjectSettings;
  readonly projectId: string | null | undefined;
  readonly presetId: string;
  readonly modelId: string | null | undefined;
}): Promise<string | null> => {
  const requested = nonEmpty(modelId);
  if (requested !== null) {
    return requested;
  }
  if (projectId === null || projectId === undefined) {
    return null;
  }

  const settings = await getProjectSettingsById(projectId);
  const preferences = settings.modelPreferences.filter((entry) => entry.presetId === presetId);
  const lastUsed = preferences
    .filter((entry) => entry.lastUsedAt !== null && entry.lastUsedAt !== undefined)
    .sort((left, right) => (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? ''))[0];
  return lastUsed?.modelId ?? preferences.find((entry) => entry.isFavorite)?.modelId ?? null;
};

const resolveInitialModeId = async ({
  getProjectSettingsById,
  modeId,
  presetId,
  projectId,
}: {
  readonly getProjectSettingsById: typeof getProjectSettings;
  readonly projectId: string | null | undefined;
  readonly presetId: string;
  readonly modeId: string | null | undefined;
}): Promise<string | null> => {
  const requested = nonEmpty(modeId);
  if (requested !== null) {
    return requested;
  }
  if (projectId === null || projectId === undefined) {
    return null;
  }

  const settings = await getProjectSettingsById(projectId);
  return (
    settings.modePreferences
      .filter(
        (entry) =>
          entry.presetId === presetId &&
          entry.lastUsedAt !== null &&
          entry.lastUsedAt !== undefined,
      )
      .sort((left, right) => (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? ''))[0]
      ?.modeId ?? null
  );
};

const markModelUsed = async ({
  markProjectModelUsed,
  modelId,
  presetId,
  projectId,
}: {
  readonly markProjectModelUsed: typeof updateProjectModelPreference;
  readonly projectId: string | null | undefined;
  readonly presetId: string;
  readonly modelId: string | null | undefined;
}): Promise<void> => {
  const effectiveProjectId = nonEmpty(projectId);
  const effectiveModelId = nonEmpty(modelId);
  if (effectiveProjectId === null || effectiveModelId === null) {
    return;
  }

  await markProjectModelUsed(effectiveProjectId, {
    presetId,
    modelId: effectiveModelId,
    markLastUsed: true,
  });
};

const markModeUsed = async ({
  markProjectModeUsed,
  modeId,
  presetId,
  projectId,
}: {
  readonly markProjectModeUsed: typeof updateProjectModePreference;
  readonly projectId: string | null | undefined;
  readonly presetId: string;
  readonly modeId: string | null | undefined;
}): Promise<void> => {
  const effectiveProjectId = nonEmpty(projectId);
  const effectiveModeId = nonEmpty(modeId);
  if (effectiveProjectId === null || effectiveModeId === null) {
    return;
  }

  await markProjectModeUsed(effectiveProjectId, {
    presetId,
    modeId: effectiveModeId,
    markLastUsed: true,
  });
};

export const createRoutineRunner = ({
  createAgentSession = createSession,
  getProjectById = getProject,
  getProjectSettingsById = getProjectSettings,
  markProjectModeUsed = updateProjectModePreference,
  markProjectModelUsed = updateProjectModelPreference,
  resolveAgentPreset = (presetId) => resolveProviderPreset({ presetId }),
  sendAgentPrompt = sendPrompt,
}: RoutineRunnerDependencies = {}) => {
  const runRoutine = async (routine: Routine): Promise<void> => {
    const preset = await resolveAgentPreset(routine.sendConfig.presetId);
    const project =
      routine.sendConfig.projectId === null || routine.sendConfig.projectId === undefined
        ? null
        : await getProjectById(routine.sendConfig.projectId);
    const cwd = routine.sendConfig.cwd ?? project?.workingDirectory ?? process.cwd();
    const initialModelId = await resolveInitialModelId({
      getProjectSettingsById,
      projectId: project?.id ?? null,
      presetId: preset.id,
      modelId: routine.sendConfig.modelId ?? null,
    });
    const initialModeId = await resolveInitialModeId({
      getProjectSettingsById,
      projectId: project?.id ?? null,
      presetId: preset.id,
      modeId: routine.sendConfig.modeId ?? null,
    });
    const session = await createAgentSession({
      projectId: project?.id ?? null,
      preset,
      command: preset.command,
      args: preset.args,
      cwd,
      initialModelId,
      initialModeId,
    });
    await markModelUsed({
      markProjectModelUsed,
      projectId: session.projectId,
      presetId: preset.id,
      modelId: session.currentModelId ?? initialModelId,
    });
    await markModeUsed({
      markProjectModeUsed,
      projectId: session.projectId,
      presetId: preset.id,
      modeId: session.currentModeId ?? initialModeId,
    });
    await sendAgentPrompt(session.sessionId, {
      prompt: routine.sendConfig.prompt,
      modelId: routine.sendConfig.modelId ?? null,
      modeId: routine.sendConfig.modeId ?? null,
    });
  };

  return { runRoutine };
};

export const runDueRoutines = async (): Promise<void> => {
  const store = createRoutineStore();
  const runner = createRoutineRunner();
  const dueRoutines = await store.listDueRoutines(new Date());

  for (const routine of dueRoutines) {
    if (runningRoutineIds.has(routine.id)) {
      continue;
    }
    runningRoutineIds.add(routine.id);
    const runAt = new Date();
    try {
      await runner.runRoutine(routine);
      await store.markRoutineRunCompleted({ routineId: routine.id, runAt, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to run routine';
      await store.markRoutineRunCompleted({ routineId: routine.id, runAt, error: message });
    } finally {
      runningRoutineIds.delete(routine.id);
    }
  }
};
