import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Trash2, Volume2 } from 'lucide-react';
import { Suspense, useCallback, useEffect, useRef, useState, type FC } from 'react';

import type {
  AgentProvidersResponse,
  AgentPreset,
  CreateRoutineRequest,
  ModeOption,
  ModelOption,
  Project,
  Routine,
  RoutineKind,
  RoutinesResponse,
  UpdateRoutineRequest,
} from '../../../shared/acp.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select.tsx';
import {
  checkAgentProviderRequest,
  createCustomAgentProviderRequest,
  createRoutineRequest,
  deleteRoutineRequest,
  deleteCustomAgentProviderRequest,
  fetchAgentModelCatalog,
  fetchAgentProviders,
  fetchAgentSlashCommands,
  fetchRoutines,
  updateAgentProviderRequest,
  updateCustomAgentProviderRequest,
  updateRoutineRequest,
} from '../../lib/api/acp.ts';
import { parseThemePreference, type ThemePreference } from '../../lib/theme.pure.ts';
import { useTheme } from '../../lib/theme.tsx';
import {
  getNotificationPermissionState,
  persistSystemNotificationPreference,
  requestNotificationPermission,
  readSystemNotificationPreference,
  showNotificationPreview,
} from '../../pwa/notifications.ts';
import {
  isTaskCompletionSoundEnabled,
  parseTaskCompletionSoundPreference,
  taskCompletionSoundOptions,
  type TaskCompletionSoundPreference,
} from '../../pwa/task-completion-sound.pure.ts';
import {
  persistTaskCompletionSoundPreference,
  playTaskCompletionSound,
  readTaskCompletionSoundPreference,
} from '../../pwa/task-completion-sound.ts';
import {
  agentModelCatalogQueryKey,
  agentProvidersQueryKey,
  agentSlashCommandsQueryKey,
} from '../projects/$projectId/queries.ts';
import { RichPromptEditor } from '../projects/$projectId/rich-prompt-editor.tsx';
import { routinesQueryKey } from './queries.ts';

const optionalFieldValue = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const formatOptionalDateTime = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value.length === 0) {
    return 'Never';
  }
  return value;
};

const dateTimeLocalValueFrom = (value: string): string => {
  if (!value.includes('T')) {
    return value;
  }
  return value.slice(0, 16);
};

type RoutineFormState = {
  readonly name: string;
  readonly enabled: boolean;
  readonly kind: RoutineKind;
  readonly cronExpression: string;
  readonly runAt: string;
  readonly presetId: string;
  readonly modelId: string;
  readonly modeId: string;
  readonly prompt: string;
};

const blankRoutineFormState = (presetId: string): RoutineFormState => ({
  name: '',
  enabled: true,
  kind: 'cron',
  cronExpression: '0 9 * * *',
  runAt: '',
  presetId,
  modelId: '',
  modeId: '',
  prompt: '',
});

const routineFormStateFromRoutine = (routine: Routine): RoutineFormState => ({
  name: routine.name,
  enabled: routine.enabled,
  kind: routine.kind,
  cronExpression: routine.kind === 'cron' ? routine.config.cronExpression : '0 9 * * *',
  runAt: routine.kind === 'scheduled' ? dateTimeLocalValueFrom(routine.config.runAt) : '',
  presetId: routine.sendConfig.presetId,
  modelId: routine.sendConfig.modelId ?? '',
  modeId: routine.sendConfig.modeId ?? '',
  prompt: routine.sendConfig.prompt,
});

const routineRequestFromFormState = ({
  project,
  state,
}: {
  readonly project: Project;
  readonly state: RoutineFormState;
}): CreateRoutineRequest => ({
  name: state.name.trim(),
  enabled: state.enabled,
  kind: state.kind,
  config:
    state.kind === 'cron'
      ? { cronExpression: state.cronExpression.trim() }
      : { runAt: state.runAt.trim() },
  sendConfig: {
    projectId: project.id,
    presetId: state.presetId,
    cwd: project.workingDirectory,
    modelId: optionalFieldValue(state.modelId),
    modeId: optionalFieldValue(state.modeId),
    prompt: state.prompt.trim(),
  },
});

const themePreferenceChoices = [
  {
    value: 'system',
    label: 'System',
    description: 'OS の外観設定に合わせます。',
  },
  {
    value: 'light',
    label: 'Light',
    description: '常にライトテーマを使います。',
  },
  {
    value: 'dark',
    label: 'Dark',
    description: '常にダークテーマを使います。',
  },
] as const satisfies readonly {
  readonly value: ThemePreference;
  readonly label: string;
  readonly description: string;
}[];

const routineDefaultSelectValue = '__remote_agent_default__';

const routineSelectValueFromOptional = (value: string): string =>
  value.trim().length === 0 ? routineDefaultSelectValue : value;

const routineOptionalValueFromSelect = (value: string): string =>
  value === routineDefaultSelectValue ? '' : value;

const routineModelOptionsWithCurrent = ({
  currentId,
  options,
}: {
  readonly currentId: string;
  readonly options: readonly ModelOption[];
}): readonly ModelOption[] => {
  const trimmed = currentId.trim();
  if (trimmed.length === 0 || options.some((option) => option.id === trimmed)) {
    return options;
  }
  return [{ id: trimmed, name: trimmed, description: 'Saved custom value' }, ...options];
};

const routineModeOptionsWithCurrent = ({
  currentId,
  options,
}: {
  readonly currentId: string;
  readonly options: readonly ModeOption[];
}): readonly ModeOption[] => {
  const trimmed = currentId.trim();
  if (trimmed.length === 0 || options.some((option) => option.id === trimmed)) {
    return options;
  }
  return [{ id: trimmed, name: trimmed, description: 'Saved custom value' }, ...options];
};

const routineOptionLabel = (option: ModelOption | ModeOption): string =>
  option.name === option.id ? option.name : `${option.name} (${option.id})`;

const providerSummaryToneClassName = (hasError: boolean): string =>
  hasError ? 'text-destructive' : 'text-muted-foreground';

const providerSummaryText = (
  summary:
    | {
        readonly availableModelCount: number;
        readonly availableModeCount: number;
        readonly currentModelId: string | null | undefined;
        readonly currentModeId: string | null | undefined;
        readonly lastError: string | null | undefined;
      }
    | null
    | undefined,
): string => {
  if (summary === null || summary === undefined) {
    return '未確認';
  }
  if (summary.lastError !== null && summary.lastError !== undefined) {
    return summary.lastError;
  }

  const currentModel =
    summary.currentModelId !== null && summary.currentModelId !== undefined
      ? `Current model: ${summary.currentModelId}`
      : null;
  const currentMode =
    summary.currentModeId !== null && summary.currentModeId !== undefined
      ? `Current mode: ${summary.currentModeId}`
      : null;
  return [
    `${String(summary.availableModelCount)} models`,
    `${String(summary.availableModeCount)} modes`,
    currentModel,
    currentMode,
  ]
    .filter((value) => value !== null)
    .join(' / ');
};

type CustomProviderDialogState =
  | { readonly mode: 'create' }
  | { readonly mode: 'edit'; readonly providerId: string };

const providerCommandText = (command: string, args: readonly string[]): string => {
  const quote = (value: string): string =>
    /\s|"/.test(value) ? `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"` : value;
  return [command, ...args]
    .filter((value) => value.length > 0)
    .map(quote)
    .join(' ');
};

const RoutinePromptField: FC<{
  readonly disabled: boolean;
  readonly onPromptReady: (readValue: () => string) => void;
  readonly presetId: string;
  readonly projectId: string;
  readonly prompt: string;
}> = ({ disabled, onPromptReady, presetId, projectId, prompt }) => {
  const [externalValue, setExternalValue] = useState({ revision: 0, value: prompt });
  const { data: slashCommandData } = useSuspenseQuery({
    queryKey: agentSlashCommandsQueryKey(projectId, presetId),
    queryFn: () => fetchAgentSlashCommands({ projectId, presetId }),
  });

  useEffect(() => {
    setExternalValue((current) => ({
      revision: current.revision + 1,
      value: prompt,
    }));
  }, [prompt, presetId]);

  return (
    <RichPromptEditor
      className="min-h-28"
      disabled={disabled}
      externalValue={externalValue}
      onSubmit={() => undefined}
      onValueReaderReady={onPromptReady}
      placeholder="Send to the agent when this routine runs."
      slashCommands={slashCommandData.commands}
    />
  );
};

const RoutineModelModeFields: FC<{
  readonly formState: RoutineFormState;
  readonly projectId: string;
  readonly setFormState: (update: (current: RoutineFormState) => RoutineFormState) => void;
}> = ({ formState, projectId, setFormState }) => {
  const { data: catalog } = useSuspenseQuery({
    queryKey: agentModelCatalogQueryKey(projectId, formState.presetId),
    queryFn: () => fetchAgentModelCatalog({ projectId, presetId: formState.presetId }),
  });
  const modelOptions = routineModelOptionsWithCurrent({
    currentId: formState.modelId,
    options: catalog.availableModels,
  });
  const modeOptions = routineModeOptionsWithCurrent({
    currentId: formState.modeId,
    options: catalog.availableModes,
  });

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="routine-model">Model</Label>
        <Select
          onValueChange={(value) => {
            if (value === null) {
              return;
            }
            setFormState((current) => ({
              ...current,
              modelId: routineOptionalValueFromSelect(value),
            }));
          }}
          value={routineSelectValueFromOptional(formState.modelId)}
        >
          <SelectTrigger className="w-full" id="routine-model">
            <SelectValue placeholder={modelOptions.length === 0 ? 'No model choices' : 'Default'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={routineDefaultSelectValue}>Default</SelectItem>
            {modelOptions.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {routineOptionLabel(model)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="routine-mode">Mode</Label>
        <Select
          onValueChange={(value) => {
            if (value === null) {
              return;
            }
            setFormState((current) => ({
              ...current,
              modeId: routineOptionalValueFromSelect(value),
            }));
          }}
          value={routineSelectValueFromOptional(formState.modeId)}
        >
          <SelectTrigger className="w-full" id="routine-mode">
            <SelectValue placeholder={modeOptions.length === 0 ? 'No mode choices' : 'Default'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={routineDefaultSelectValue}>Default</SelectItem>
            {modeOptions.map((mode) => (
              <SelectItem key={mode.id} value={mode.id}>
                {routineOptionLabel(mode)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

const RoutineDialogBody: FC<{
  readonly formError: string | null;
  readonly formState: RoutineFormState;
  readonly isMutating: boolean;
  readonly mode: 'create' | 'edit';
  readonly onCancel: () => void;
  readonly onSubmit: (prompt: string) => void;
  readonly project: Project;
  readonly selectableProviders: readonly AgentPreset[];
  readonly setFormState: (update: (current: RoutineFormState) => RoutineFormState) => void;
}> = ({
  formError,
  formState,
  isMutating,
  mode,
  onCancel,
  onSubmit,
  project,
  selectableProviders,
  setFormState,
}) => {
  const promptReaderRef = useRef<(() => string) | null>(null);
  const handlePromptReady = useCallback((readValue: () => string) => {
    promptReaderRef.current = readValue;
  }, []);
  const canSubmit =
    formState.name.trim().length > 0 &&
    formState.presetId.trim().length > 0 &&
    (formState.kind === 'cron'
      ? formState.cronExpression.trim().length > 0
      : formState.runAt.trim().length > 0);

  return (
    <>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="routine-name">Name</Label>
            <Input
              id="routine-name"
              onChange={(event) => {
                setFormState((current) => ({ ...current, name: event.target.value }));
              }}
              placeholder="Daily summary"
              value={formState.name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="routine-kind">Kind</Label>
            <Select
              onValueChange={(kind) => {
                if (kind === 'cron' || kind === 'scheduled') {
                  setFormState((current) => ({ ...current, kind }));
                }
              }}
              value={formState.kind}
            >
              <SelectTrigger className="w-full" id="routine-kind">
                <SelectValue placeholder="Kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cron">cron</SelectItem>
                <SelectItem value="scheduled">scheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formState.kind === 'cron' ? (
            <div className="space-y-2">
              <Label htmlFor="routine-cron">Cron expression</Label>
              <Input
                id="routine-cron"
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    cronExpression: event.target.value,
                  }));
                }}
                placeholder="0 9 * * *"
                value={formState.cronExpression}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="routine-run-at">Run at</Label>
              <Input
                id="routine-run-at"
                onChange={(event) => {
                  setFormState((current) => ({ ...current, runAt: event.target.value }));
                }}
                type="datetime-local"
                value={formState.runAt}
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-3 self-end rounded-md border px-3 py-2">
            <span className="text-sm font-medium">Enabled</span>
            <RoutineEnabledToggle
              checked={formState.enabled}
              disabled={isMutating}
              onCheckedChange={(enabled) => {
                setFormState((current) => ({ ...current, enabled }));
              }}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="routine-provider">Provider</Label>
            <Select
              onValueChange={(presetId) => {
                if (presetId === null) {
                  return;
                }
                setFormState((current) => ({
                  ...current,
                  modelId: current.presetId === presetId ? current.modelId : '',
                  modeId: current.presetId === presetId ? current.modeId : '',
                  presetId,
                }));
              }}
              value={formState.presetId}
            >
              <SelectTrigger className="w-full" id="routine-provider">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                {selectableProviders.length === 0 ? (
                  <SelectItem value={formState.presetId}>{formState.presetId}</SelectItem>
                ) : null}
                {selectableProviders.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Project path</Label>
            <p className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-sm text-muted-foreground">
              {project.workingDirectory}
            </p>
          </div>
        </div>

        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading choices...</p>}>
          <RoutineModelModeFields
            formState={formState}
            projectId={project.id}
            setFormState={setFormState}
          />
        </Suspense>

        <div className="space-y-2">
          <Label>Prompt</Label>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading commands...</p>}>
            <RoutinePromptField
              disabled={isMutating}
              onPromptReady={handlePromptReady}
              presetId={formState.presetId}
              projectId={project.id}
              prompt={formState.prompt}
            />
          </Suspense>
        </div>

        {formError === null ? null : <p className="text-sm text-destructive">{formError}</p>}
      </div>
      <DialogFooter>
        <Button disabled={isMutating} onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button
          disabled={!canSubmit || isMutating}
          onClick={() => {
            onSubmit(promptReaderRef.current?.() ?? formState.prompt);
          }}
          type="button"
        >
          {mode === 'create' ? <Plus className="size-4" /> : <Pencil className="size-4" />}
          {mode === 'create' ? 'Create' : 'Update'}
        </Button>
      </DialogFooter>
    </>
  );
};

const RoutineEnabledToggle: FC<{
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}> = ({ checked, disabled, onCheckedChange }) => (
  <button
    aria-checked={checked}
    aria-label={checked ? 'Disable routine' : 'Enable routine'}
    className={[
      'inline-flex h-8 min-w-16 items-center gap-2 rounded-full border px-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
      checked
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-muted text-muted-foreground',
    ].join(' ')}
    disabled={disabled}
    onClick={() => {
      onCheckedChange(!checked);
    }}
    role="switch"
    type="button"
  >
    <span
      className={[
        'size-6 rounded-full bg-background shadow-sm transition-transform',
        checked ? 'translate-x-8' : 'translate-x-0',
      ].join(' ')}
    />
    <span className="sr-only">{checked ? 'Enabled' : 'Disabled'}</span>
  </button>
);

export const RoutineSettingsPanel: FC<{ readonly project: Project }> = ({ project }) => {
  const queryClient = useQueryClient();
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [formState, setFormState] = useState<RoutineFormState>(blankRoutineFormState('codex'));
  const [formError, setFormError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: routineData } = useSuspenseQuery({
    queryKey: routinesQueryKey,
    queryFn: fetchRoutines,
  });
  const { data: providerData } = useSuspenseQuery({
    queryKey: agentProvidersQueryKey,
    queryFn: fetchAgentProviders,
  });
  const createRoutineMutation = useMutation({
    mutationFn: createRoutineRequest,
    onSuccess: (data) => {
      queryClient.setQueryData<RoutinesResponse>(routinesQueryKey, data);
    },
  });
  const updateRoutineMutation = useMutation({
    mutationFn: ({
      request,
      routineId,
    }: {
      readonly routineId: string;
      readonly request: UpdateRoutineRequest;
    }) => updateRoutineRequest(routineId, request),
    onSuccess: (data) => {
      queryClient.setQueryData<RoutinesResponse>(routinesQueryKey, data);
    },
  });
  const deleteRoutineMutation = useMutation({
    mutationFn: deleteRoutineRequest,
    onSuccess: (data) => {
      queryClient.setQueryData<RoutinesResponse>(routinesQueryKey, data);
    },
  });
  const selectableProviders =
    providerData?.providers.filter((entry) => entry.enabled).map((entry) => entry.preset) ?? [];
  const projectRoutines = routineData.routines.filter(
    (routine) => routine.sendConfig.projectId === project.id,
  );
  const isMutating =
    createRoutineMutation.isPending ||
    updateRoutineMutation.isPending ||
    deleteRoutineMutation.isPending;
  const handleSubmit = async (prompt: string) => {
    const nextFormState = { ...formState, prompt };
    const canSubmit =
      nextFormState.name.trim().length > 0 &&
      nextFormState.presetId.trim().length > 0 &&
      nextFormState.prompt.trim().length > 0 &&
      (nextFormState.kind === 'cron'
        ? nextFormState.cronExpression.trim().length > 0
        : nextFormState.runAt.trim().length > 0);

    if (!canSubmit) {
      setFormError('Name, schedule, provider, and prompt are required.');
      return;
    }

    setFormError(null);
    try {
      const request = routineRequestFromFormState({ project, state: nextFormState });
      if (editingRoutineId === null) {
        await createRoutineMutation.mutateAsync(request);
      } else {
        await updateRoutineMutation.mutateAsync({ routineId: editingRoutineId, request });
      }
      setEditingRoutineId(null);
      setFormState(blankRoutineFormState(nextFormState.presetId));
      setDialogOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Routine request failed.');
    }
  };

  const handleCreateRoutine = () => {
    const fallbackPresetId = selectableProviders[0]?.id ?? formState.presetId;
    setEditingRoutineId(null);
    setFormError(null);
    setFormState(blankRoutineFormState(fallbackPresetId));
    setDialogOpen(true);
  };

  const handleEditRoutine = (routine: Routine) => {
    setEditingRoutineId(routine.id);
    setFormError(null);
    setFormState(routineFormStateFromRoutine(routine));
    setDialogOpen(true);
  };

  const handleCancelEdit = () => {
    setEditingRoutineId(null);
    setFormError(null);
    setFormState(blankRoutineFormState(formState.presetId));
    setDialogOpen(false);
  };

  const handleToggleRoutine = async (routine: Routine, enabled: boolean) => {
    setFormError(null);
    try {
      await updateRoutineMutation.mutateAsync({
        routineId: routine.id,
        request: { enabled },
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Routine update failed.');
    }
  };

  const handleDeleteRoutine = async (routineId: string) => {
    setFormError(null);
    try {
      await deleteRoutineMutation.mutateAsync(routineId);
      if (editingRoutineId === routineId) {
        handleCancelEdit();
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Routine delete failed.');
    }
  };

  return (
    <Card className="app-panel">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Routines</CardTitle>
            <CardDescription>
              {project.name} で実行する定期実行と予約送信の routine を管理します。
            </CardDescription>
          </div>
          <Button onClick={handleCreateRoutine} type="button">
            <Plus className="size-4" />
            New routine
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          {projectRoutines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No routines yet.</p>
          ) : null}
          {projectRoutines.map((routine) => (
            <div
              className="space-y-3 rounded-lg border border-border/70 px-3 py-3"
              key={routine.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{routine.name}</p>
                    <Badge variant={routine.enabled ? 'default' : 'outline'}>
                      {routine.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <Badge variant="secondary">{routine.kind}</Badge>
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {routine.kind === 'cron' ? routine.config.cronExpression : routine.config.runAt}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Next: {formatOptionalDateTime(routine.nextRunAt)} · Last:{' '}
                    {formatOptionalDateTime(routine.lastRunAt)}
                  </p>
                  {routine.lastError === null || routine.lastError === undefined ? null : (
                    <p className="text-xs text-destructive">{routine.lastError}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RoutineEnabledToggle
                    checked={routine.enabled}
                    disabled={isMutating}
                    onCheckedChange={(enabled) => {
                      void handleToggleRoutine(routine, enabled);
                    }}
                  />
                  <Button
                    aria-label="Edit routine"
                    disabled={isMutating}
                    onClick={() => {
                      handleEditRoutine(routine);
                    }}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    aria-label="Delete routine"
                    disabled={isMutating}
                    onClick={() => {
                      void handleDeleteRoutine(routine.id);
                    }}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {routine.sendConfig.prompt}
              </p>
            </div>
          ))}
        </div>
        <Dialog
          onOpenChange={(open) => {
            if (!open) {
              handleCancelEdit();
              return;
            }
            setDialogOpen(true);
          }}
          open={dialogOpen}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingRoutineId === null ? 'New routine' : 'Edit routine'}
              </DialogTitle>
              <DialogDescription>
                cron または scheduled を選び、送信先 provider と prompt を設定します。
              </DialogDescription>
            </DialogHeader>
            {dialogOpen ? (
              <RoutineDialogBody
                formError={formError}
                formState={formState}
                isMutating={isMutating}
                mode={editingRoutineId === null ? 'create' : 'edit'}
                onCancel={handleCancelEdit}
                onSubmit={(prompt) => {
                  void handleSubmit(prompt);
                }}
                project={project}
                selectableProviders={selectableProviders}
                setFormState={setFormState}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export const ProviderSettingsPanel: FC = () => {
  const queryClient = useQueryClient();
  const { data: providerData } = useSuspenseQuery({
    queryKey: agentProvidersQueryKey,
    queryFn: fetchAgentProviders,
  });
  const [activeProviderAction, setActiveProviderAction] = useState<
    Readonly<Record<string, boolean>>
  >({});
  const [customProviderName, setCustomProviderName] = useState('');
  const [customProviderCommandText, setCustomProviderCommandText] = useState('');
  const [customProviderDialogState, setCustomProviderDialogState] =
    useState<CustomProviderDialogState | null>(null);
  const updateProviderMutation = useMutation({
    mutationFn: ({ enabled, presetId }: { readonly presetId: string; readonly enabled: boolean }) =>
      updateAgentProviderRequest(presetId, { enabled }),
    onSuccess: (data) => {
      queryClient.setQueryData<AgentProvidersResponse>(agentProvidersQueryKey, data);
    },
  });
  const createCustomProviderMutation = useMutation({
    mutationFn: createCustomAgentProviderRequest,
    onSuccess: (data) => {
      queryClient.setQueryData<AgentProvidersResponse>(agentProvidersQueryKey, data);
    },
  });
  const deleteCustomProviderMutation = useMutation({
    mutationFn: deleteCustomAgentProviderRequest,
    onSuccess: (data) => {
      queryClient.setQueryData<AgentProvidersResponse>(agentProvidersQueryKey, data);
    },
  });
  const updateCustomProviderMutation = useMutation({
    mutationFn: ({
      commandText,
      name,
      providerId,
    }: {
      readonly providerId: string;
      readonly name: string;
      readonly commandText: string;
    }) => updateCustomAgentProviderRequest(providerId, { name, commandText }),
    onSuccess: (data) => {
      queryClient.setQueryData<AgentProvidersResponse>(agentProvidersQueryKey, data);
    },
  });
  const checkProviderMutation = useMutation({
    mutationFn: ({ presetId }: { readonly presetId: string }) =>
      checkAgentProviderRequest(presetId, { cwd: null }),
  });

  const handleProviderToggle = async ({
    enabled,
    presetId,
  }: {
    readonly presetId: string;
    readonly enabled: boolean;
  }) => {
    setActiveProviderAction((current) => ({ ...current, [presetId]: true }));
    try {
      const response = await updateProviderMutation.mutateAsync({ presetId, enabled });
      queryClient.setQueryData<AgentProvidersResponse>(agentProvidersQueryKey, response);
      if (enabled) {
        try {
          await checkProviderMutation.mutateAsync({ presetId });
        } finally {
          await queryClient.invalidateQueries({ queryKey: agentProvidersQueryKey });
        }
      }
    } catch {
      await queryClient.invalidateQueries({ queryKey: agentProvidersQueryKey });
    } finally {
      setActiveProviderAction((current) => ({ ...current, [presetId]: false }));
    }
  };

  const openCreateCustomProviderDialog = () => {
    setCustomProviderName('');
    setCustomProviderCommandText('');
    setCustomProviderDialogState({ mode: 'create' });
  };

  const openEditCustomProviderDialog = (input: {
    readonly providerId: string;
    readonly name: string;
    readonly command: string;
    readonly args: readonly string[];
  }) => {
    setCustomProviderName(input.name);
    setCustomProviderCommandText(providerCommandText(input.command, input.args));
    setCustomProviderDialogState({ mode: 'edit', providerId: input.providerId });
  };

  const closeCustomProviderDialog = () => {
    setCustomProviderDialogState(null);
    setCustomProviderName('');
    setCustomProviderCommandText('');
  };

  const handleSubmitCustomProvider = async () => {
    if (customProviderDialogState === null) {
      return;
    }

    const actionKey =
      customProviderDialogState.mode === 'create'
        ? '__custom_provider_create__'
        : customProviderDialogState.providerId;
    setActiveProviderAction((current) => ({ ...current, [actionKey]: true }));
    try {
      if (customProviderDialogState.mode === 'create') {
        await createCustomProviderMutation.mutateAsync({
          name: customProviderName,
          commandText: customProviderCommandText,
        });
      } else {
        await updateCustomProviderMutation.mutateAsync({
          providerId: customProviderDialogState.providerId,
          name: customProviderName,
          commandText: customProviderCommandText,
        });
      }
      closeCustomProviderDialog();
      await queryClient.invalidateQueries({ queryKey: agentProvidersQueryKey });
    } finally {
      setActiveProviderAction((current) => ({ ...current, [actionKey]: false }));
    }
  };

  const handleDeleteCustomProvider = async (providerId: string) => {
    setActiveProviderAction((current) => ({ ...current, [providerId]: true }));
    try {
      await deleteCustomProviderMutation.mutateAsync(providerId);
      await queryClient.invalidateQueries({ queryKey: agentProvidersQueryKey });
    } finally {
      setActiveProviderAction((current) => ({ ...current, [providerId]: false }));
    }
  };

  useEffect(() => {
    const uncheckedProvider = providerData.providers.find(
      (entry) =>
        entry.enabled &&
        entry.catalogSummary === null &&
        activeProviderAction[entry.preset.id] !== true &&
        !checkProviderMutation.isPending,
    );
    if (uncheckedProvider === undefined) {
      return;
    }

    setActiveProviderAction((current) => ({
      ...current,
      [uncheckedProvider.preset.id]: true,
    }));
    void checkProviderMutation
      .mutateAsync({ presetId: uncheckedProvider.preset.id })
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: agentProvidersQueryKey });
        setActiveProviderAction((current) => ({
          ...current,
          [uncheckedProvider.preset.id]: false,
        }));
      });
  }, [activeProviderAction, checkProviderMutation, providerData.providers, queryClient]);

  return (
    <Card className="app-panel">
      <CardHeader>
        <CardTitle>Providers</CardTitle>
        <CardDescription>プロジェクトで利用する ACP provider を選択します。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {providerData.providers.map((entry) => {
          const isBusy = activeProviderAction[entry.preset.id] === true;
          const summary = entry.catalogSummary;
          const summaryHasError = summary?.lastError !== null && summary?.lastError !== undefined;
          const isCustomProvider = entry.preset.id.startsWith('custom:');
          return (
            <div className="rounded-2xl border border-border/70 px-4 py-4" key={entry.preset.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{entry.preset.label}</span>
                    <Badge variant={entry.enabled ? 'default' : 'outline'}>
                      {entry.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{entry.preset.description}</p>
                  <span className="block break-all font-mono text-xs text-muted-foreground">
                    {entry.preset.command} {entry.preset.args.join(' ')}
                  </span>
                  {entry.enabled ? (
                    <p className={`text-xs ${providerSummaryToneClassName(summaryHasError)}`}>
                      {isBusy ? '...確認中' : providerSummaryText(summary)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">無効</p>
                  )}
                </div>
                {isCustomProvider ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      aria-label={`${entry.preset.label} を編集`}
                      disabled={isBusy}
                      onClick={() => {
                        openEditCustomProviderDialog({
                          providerId: entry.preset.id,
                          name: entry.preset.label,
                          command: entry.preset.command,
                          args: entry.preset.args,
                        });
                      }}
                      size="icon-sm"
                      title="編集"
                      type="button"
                      variant="ghost"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      aria-label={`${entry.preset.label} を削除`}
                      disabled={isBusy}
                      onClick={() => {
                        void handleDeleteCustomProvider(entry.preset.id);
                      }}
                      size="icon-sm"
                      title="削除"
                      type="button"
                      variant="ghost"
                    >
                      {isBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button
                    disabled={isBusy}
                    onClick={() => {
                      void handleProviderToggle({
                        presetId: entry.preset.id,
                        enabled: !entry.enabled,
                      });
                    }}
                    type="button"
                    variant={entry.enabled ? 'outline' : 'default'}
                  >
                    {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                    {isBusy ? '...確認中' : entry.enabled ? '無効にする' : '有効にする'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        <Button
          className="w-full justify-center"
          onClick={openCreateCustomProviderDialog}
          type="button"
          variant="outline"
        >
          <Plus className="size-4" />
          Custom Provider を追加
        </Button>
        <Dialog
          onOpenChange={(open) => {
            if (!open) {
              closeCustomProviderDialog();
            }
          }}
          open={customProviderDialogState !== null}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {customProviderDialogState?.mode === 'edit'
                  ? 'Custom Provider を編集'
                  : 'Custom Provider を追加'}
              </DialogTitle>
              <DialogDescription>
                ACP agent list から対応 agent を探すか、ACP 対応 server を実装して、stdio
                で起動できるコマンドを入力してください。
                https://agentclientprotocol.com/get-started/agents
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="custom-provider-dialog-name">Name</Label>
                <Input
                  id="custom-provider-dialog-name"
                  onChange={(event) => {
                    setCustomProviderName(event.target.value);
                  }}
                  placeholder="hoge-agent"
                  value={customProviderName}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-provider-dialog-command">Command</Label>
                <Input
                  id="custom-provider-dialog-command"
                  onChange={(event) => {
                    setCustomProviderCommandText(event.target.value);
                  }}
                  placeholder="npx hoge-agent --acp"
                  value={customProviderCommandText}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={closeCustomProviderDialog} type="button" variant="outline">
                キャンセル
              </Button>
              <Button
                disabled={
                  customProviderName.trim().length === 0 ||
                  customProviderCommandText.trim().length === 0 ||
                  activeProviderAction[
                    customProviderDialogState?.mode === 'edit'
                      ? customProviderDialogState.providerId
                      : '__custom_provider_create__'
                  ] === true
                }
                onClick={() => {
                  void handleSubmitCustomProvider();
                }}
                type="button"
              >
                {activeProviderAction[
                  customProviderDialogState?.mode === 'edit'
                    ? customProviderDialogState.providerId
                    : '__custom_provider_create__'
                ] === true ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {customProviderDialogState?.mode === 'edit' ? '保存' : '追加'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export const AppearanceSettingsPanel: FC = () => {
  const { preference, resolvedTheme, setPreference } = useTheme();

  return (
    <Card className="app-panel">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>UI の配色テーマを設定します。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
        <div className="space-y-1">
          <Label htmlFor="theme-preference">Theme</Label>
          <p className="text-sm text-muted-foreground">
            現在の表示は <span className="font-medium text-foreground">{resolvedTheme}</span> です。
          </p>
        </div>
        <Select
          onValueChange={(nextPreference) => {
            setPreference(parseThemePreference(nextPreference));
          }}
          value={preference}
        >
          <SelectTrigger className="w-full" id="theme-preference">
            <SelectValue placeholder="Theme" />
          </SelectTrigger>
          <SelectContent align="end" className="min-w-64">
            {themePreferenceChoices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                <div className="flex flex-col">
                  <span>{choice.label}</span>
                  <span className="text-xs text-muted-foreground">{choice.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
};

export const NotificationsSettingsPanel: FC = () => {
  const [notificationPermission, setNotificationPermission] = useState(
    getNotificationPermissionState,
  );
  const [systemNotificationPreference, setSystemNotificationPreference] = useState(
    readSystemNotificationPreference,
  );
  const [taskCompletionSoundPreference, setTaskCompletionSoundPreference] = useState(
    readTaskCompletionSoundPreference,
  );
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [isUpdatingSystemNotifications, setIsUpdatingSystemNotifications] = useState(false);

  useEffect(() => {
    const syncNotificationPermission = () => {
      setNotificationPermission(getNotificationPermissionState());
      setSystemNotificationPreference(readSystemNotificationPreference());
    };

    syncNotificationPermission();
    window.addEventListener('focus', syncNotificationPermission);

    return () => {
      window.removeEventListener('focus', syncNotificationPermission);
    };
  }, []);

  const handleSystemNotificationToggle = async () => {
    if (systemNotificationPreference === 'enabled') {
      persistSystemNotificationPreference('disabled');
      setSystemNotificationPreference('disabled');
      setNotificationError(null);
      return;
    }

    if (notificationPermission === 'unsupported') {
      setNotificationError('この環境では Service Worker 通知を利用できません。');
      return;
    }

    setIsUpdatingSystemNotifications(true);
    try {
      const nextPermission =
        notificationPermission === 'granted' ? 'granted' : await requestNotificationPermission();
      setNotificationPermission(nextPermission);

      if (nextPermission === 'granted') {
        persistSystemNotificationPreference('enabled');
        setSystemNotificationPreference('enabled');
        setNotificationError(null);
        return;
      }

      persistSystemNotificationPreference('disabled');
      setSystemNotificationPreference('disabled');
      if (nextPermission === 'denied') {
        setNotificationError('通知が拒否されています。ブラウザ設定から許可してください。');
        return;
      }
      setNotificationError('この環境では Service Worker 通知を利用できません。');
    } finally {
      setIsUpdatingSystemNotifications(false);
    }
  };

  const handlePreviewNotification = async () => {
    const didShowNotification = await showNotificationPreview({
      projectId: 'settings',
      projectName: 'Remote Agent',
      sessionId: 'settings',
      text: 'バックグラウンド時の assistant 応答をこの形式で通知します。',
      timestamp: Date.now(),
      url: '/settings',
    });

    if (!didShowNotification) {
      setNotificationError('通知を表示できませんでした。先に通知を有効にしてください。');
      return;
    }

    setNotificationError(null);
  };

  const handleTaskCompletionSoundChange = (nextPreference: TaskCompletionSoundPreference) => {
    setTaskCompletionSoundPreference(nextPreference);
    persistTaskCompletionSoundPreference(nextPreference);
    setNotificationError(null);
  };

  const handlePreviewTaskCompletionSound = async () => {
    const didPlaySound = await playTaskCompletionSound();

    if (!didPlaySound) {
      setNotificationError('音を再生できませんでした。ブラウザの音声再生設定を確認してください。');
      return;
    }

    setNotificationError(null);
  };

  return (
    <Card className="app-panel">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          バックグラウンド時の assistant 応答を Service Worker 通知で受け取るための設定。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Label>System notifications</Label>
              <Badge variant="outline">{notificationPermission}</Badge>
              <Badge variant={systemNotificationPreference === 'enabled' ? 'default' : 'outline'}>
                {systemNotificationPreference === 'enabled' ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              バックグラウンド時の assistant 応答をシステム通知で受け取ります。
            </p>
          </div>
          <Button
            disabled={
              notificationPermission === 'unsupported' ||
              (notificationPermission === 'denied' && systemNotificationPreference !== 'enabled')
            }
            onClick={() => {
              void handleSystemNotificationToggle();
            }}
            type="button"
            variant={systemNotificationPreference === 'enabled' ? 'outline' : 'default'}
          >
            {isUpdatingSystemNotifications ? <Loader2 className="size-4 animate-spin" /> : null}
            {isUpdatingSystemNotifications
              ? '...確認中'
              : systemNotificationPreference === 'enabled'
                ? '無効にする'
                : '有効にする'}
          </Button>
          <Button
            disabled={
              notificationPermission !== 'granted' || systemNotificationPreference !== 'enabled'
            }
            onClick={() => {
              void handlePreviewNotification();
            }}
            type="button"
            variant="outline"
          >
            Test
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="task-completion-sound">Completion sound</Label>
            <p className="text-sm text-muted-foreground">
              エージェントのタスク/応答が完了したときに音を鳴らします。
            </p>
          </div>
          <Select
            onValueChange={(value) => {
              handleTaskCompletionSoundChange(parseTaskCompletionSoundPreference(value));
            }}
            value={taskCompletionSoundPreference}
          >
            <SelectTrigger className="w-full" id="task-completion-sound">
              <SelectValue placeholder="Completion sound" />
            </SelectTrigger>
            <SelectContent>
              {taskCompletionSoundOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!isTaskCompletionSoundEnabled(taskCompletionSoundPreference)}
            onClick={() => {
              void handlePreviewTaskCompletionSound();
            }}
            type="button"
            variant="outline"
          >
            <Volume2 className="size-4" />
            Test sound
          </Button>
        </div>
        {notificationPermission === 'denied' ? (
          <p className="text-xs text-muted-foreground">
            ブラウザ側で通知が拒否されています。再度有効にする場合はブラウザ設定から許可してください。
          </p>
        ) : null}
        {notificationError === null ? null : (
          <p className="text-xs text-destructive">{notificationError}</p>
        )}
      </CardContent>
    </Card>
  );
};
