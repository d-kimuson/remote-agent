import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FC } from 'react';

import type { Routine, RoutineKind } from '../../shared/acp.ts';
import type { NativeAcpApi } from '../api/acp.ts';

import {
  BodyText,
  Button,
  ErrorState,
  FieldLabel,
  LoadingState,
  Panel,
  RowButton,
  Screen,
  ScreenScroll,
  TextField,
} from '../components/native-shell.tsx';
import {
  defaultPresetId,
  enabledProviderPresets,
  routineRequestFromDraft,
  routineUpdateFromDraft,
  scheduleValueFromRoutine,
} from '../session-options.pure.ts';

type RoutineDraft = {
  readonly editingRoutineId: string | null;
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
};

const emptyDraft = (presetId: string): RoutineDraft => ({
  editingRoutineId: null,
  name: '',
  enabled: true,
  kind: 'scheduled',
  scheduleValue: new Date().toISOString(),
  projectId: null,
  presetId,
  cwd: null,
  modelId: null,
  modeId: null,
  prompt: '',
});

const draftFromRoutine = (routine: Routine): RoutineDraft => ({
  editingRoutineId: routine.id,
  name: routine.name,
  enabled: routine.enabled,
  kind: routine.kind,
  scheduleValue: scheduleValueFromRoutine(routine),
  projectId: routine.sendConfig.projectId ?? null,
  presetId: routine.sendConfig.presetId,
  cwd: routine.sendConfig.cwd ?? null,
  modelId: routine.sendConfig.modelId ?? null,
  modeId: routine.sendConfig.modeId ?? null,
  prompt: routine.sendConfig.prompt,
});

export const RoutinesScreen: FC<{
  readonly api: NativeAcpApi;
  readonly onBack: () => void;
  readonly onOpenSettings: () => void;
}> = ({ api, onBack, onOpenSettings }) => {
  const queryClient = useQueryClient();
  const providersQuery = useQuery({
    queryKey: ['native', 'providers'],
    queryFn: api.fetchAgentProviders,
  });
  const projectsQuery = useQuery({
    queryKey: ['native', 'projects'],
    queryFn: api.fetchProjects,
  });
  const routinesQuery = useQuery({
    queryKey: ['native', 'routines'],
    queryFn: api.fetchRoutines,
  });
  const presets = useMemo(
    () => enabledProviderPresets(providersQuery.data?.providers ?? []),
    [providersQuery.data?.providers],
  );
  const initialPresetId = defaultPresetId(presets) ?? 'codex';
  const [draft, setDraft] = useState<RoutineDraft>(emptyDraft(initialPresetId));
  const upsertRoutineMutation = useMutation({
    mutationFn: async () => {
      if (draft.editingRoutineId === null) {
        const request = routineRequestFromDraft(draft);
        if (request === null) {
          throw new Error('Routine name, schedule, provider, and prompt are required');
        }
        return api.createRoutine(request);
      }
      const request = routineUpdateFromDraft(draft);
      if (request === null) {
        throw new Error('Routine name, schedule, provider, and prompt are required');
      }
      return api.updateRoutine(draft.editingRoutineId, request);
    },
    onSuccess: (response) => {
      queryClient.setQueryData(['native', 'routines'], response);
      setDraft(emptyDraft(initialPresetId));
    },
  });
  const deleteRoutineMutation = useMutation({
    mutationFn: api.deleteRoutine,
    onSuccess: (response) => {
      queryClient.setQueryData(['native', 'routines'], response);
    },
  });

  const action = (
    <>
      <Button onPress={onOpenSettings} variant="ghost">
        Settings
      </Button>
      <Button onPress={onBack} variant="ghost">
        Back
      </Button>
    </>
  );

  if (providersQuery.isLoading || projectsQuery.isLoading || routinesQuery.isLoading) {
    return <LoadingState label="Routines を読み込んでいます" />;
  }

  const error =
    providersQuery.error?.message ??
    projectsQuery.error?.message ??
    routinesQuery.error?.message ??
    upsertRoutineMutation.error?.message ??
    deleteRoutineMutation.error?.message ??
    null;
  const routines = routinesQuery.data?.routines ?? [];
  const projects = projectsQuery.data?.projects ?? [];

  return (
    <Screen action={action} title="Routines">
      <ScreenScroll>
        {error !== null ? (
          <ErrorState
            message={error}
            onRetry={() => {
              void routinesQuery.refetch();
            }}
          />
        ) : null}
        <Panel>
          <BodyText>{draft.editingRoutineId === null ? 'Create routine' : 'Edit routine'}</BodyText>
          <FieldLabel>Name</FieldLabel>
          <TextField
            onChangeText={(name) => {
              setDraft({ ...draft, name });
            }}
            value={draft.name}
          />
          <RowButton
            label={draft.enabled ? 'Enabled' : 'Disabled'}
            onPress={() => {
              setDraft({ ...draft, enabled: !draft.enabled });
            }}
            selected={draft.enabled}
          />
          <FieldLabel>Kind</FieldLabel>
          <RowButton
            label="Scheduled"
            onPress={() => {
              setDraft({ ...draft, kind: 'scheduled' });
            }}
            selected={draft.kind === 'scheduled'}
          />
          <RowButton
            label="Cron"
            onPress={() => {
              setDraft({ ...draft, kind: 'cron' });
            }}
            selected={draft.kind === 'cron'}
          />
          <FieldLabel>{draft.kind === 'cron' ? 'Cron expression' : 'Run at'}</FieldLabel>
          <TextField
            onChangeText={(scheduleValue) => {
              setDraft({ ...draft, scheduleValue });
            }}
            placeholder={draft.kind === 'cron' ? '0 9 * * *' : '2026-01-01T09:00:00.000Z'}
            value={draft.scheduleValue}
          />
          <FieldLabel>Project</FieldLabel>
          <RowButton
            label="No project"
            onPress={() => {
              setDraft({ ...draft, projectId: null, cwd: null });
            }}
            selected={draft.projectId === null}
          />
          {projects.map((project) => (
            <RowButton
              detail={project.workingDirectory}
              key={project.id}
              label={project.name}
              onPress={() => {
                setDraft({ ...draft, projectId: project.id, cwd: project.workingDirectory });
              }}
              selected={draft.projectId === project.id}
            />
          ))}
          <FieldLabel>Provider</FieldLabel>
          {presets.map((preset) => (
            <RowButton
              key={preset.id}
              label={preset.label}
              onPress={() => {
                setDraft({ ...draft, presetId: preset.id });
              }}
              selected={draft.presetId === preset.id}
            />
          ))}
          <FieldLabel>Model ID</FieldLabel>
          <TextField
            onChangeText={(modelId) => {
              setDraft({ ...draft, modelId: modelId.trim().length === 0 ? null : modelId });
            }}
            placeholder="Optional"
            value={draft.modelId ?? ''}
          />
          <FieldLabel>Mode ID</FieldLabel>
          <TextField
            onChangeText={(modeId) => {
              setDraft({ ...draft, modeId: modeId.trim().length === 0 ? null : modeId });
            }}
            placeholder="Optional"
            value={draft.modeId ?? ''}
          />
          <FieldLabel>Prompt</FieldLabel>
          <TextField
            multiline
            onChangeText={(prompt) => {
              setDraft({ ...draft, prompt });
            }}
            value={draft.prompt}
          />
          <Button
            disabled={upsertRoutineMutation.isPending}
            onPress={() => {
              upsertRoutineMutation.mutate();
            }}
          >
            {upsertRoutineMutation.isPending ? 'Saving...' : 'Save routine'}
          </Button>
        </Panel>
        {routines.map((routine) => (
          <Panel key={routine.id}>
            <BodyText>{routine.name}</BodyText>
            <BodyText muted>
              {routine.enabled ? 'Enabled' : 'Disabled'} / {routine.kind} /{' '}
              {scheduleValueFromRoutine(routine)}
            </BodyText>
            <BodyText muted>{routine.sendConfig.prompt}</BodyText>
            {routine.lastError !== null && routine.lastError !== undefined ? (
              <BodyText>{routine.lastError}</BodyText>
            ) : null}
            <Button
              onPress={() => {
                setDraft(draftFromRoutine(routine));
              }}
              variant="secondary"
            >
              Edit
            </Button>
            <Button
              disabled={deleteRoutineMutation.isPending}
              onPress={() => {
                deleteRoutineMutation.mutate(routine.id);
              }}
              variant="secondary"
            >
              Delete
            </Button>
          </Panel>
        ))}
        {routines.length === 0 ? (
          <Panel>
            <BodyText muted>No routines found.</BodyText>
          </Panel>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
};
