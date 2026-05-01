import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Loader2, Mic, Paperclip, Pencil, Plus, Trash2, Volume2, X } from 'lucide-react';
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FC,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type {
  AgentProvidersResponse,
  AgentPreset,
  AppLanguage,
  AppSubmitKeyBinding,
  CreateRoutineRequest,
  ModeOption,
  ModelOption,
  Project,
  Routine,
  RoutineKind,
  RoutinesResponse,
  UpdateRoutineRequest,
  UploadedAttachment,
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
  fetchAppSettings,
  fetchAgentModelCatalog,
  fetchAgentProviders,
  fetchAgentSlashCommands,
  fetchRoutines,
  updateAgentProviderRequest,
  updateAppSettingsRequest,
  updateCustomAgentProviderRequest,
  updateRoutineRequest,
  uploadAttachmentsRequest,
} from '../../lib/api/acp.ts';
import { parseThemePreference, type ThemePreference } from '../../lib/theme.pure.ts';
import { useTheme } from '../../lib/theme.tsx';
import { cn } from '../../lib/utils.ts';
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
import { ApiAuthForm } from '../auth/api-auth-form.tsx';
import { attachmentContentBlockLabel } from '../projects/$projectId/chat-state.pure.ts';
import {
  agentModelCatalogQueryKey,
  agentProvidersQueryKey,
  agentSlashCommandsQueryKey,
} from '../projects/$projectId/queries.ts';
import { appendRichPromptText } from '../projects/$projectId/rich-prompt-editor.pure.ts';
import { RichPromptEditor } from '../projects/$projectId/rich-prompt-editor.tsx';
import { appSettingsQueryKey, routinesQueryKey } from './queries.ts';

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

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  readonly SpeechRecognition?: SpeechRecognitionConstructor;
  readonly webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const resolveSpeechRecognitionConstructor = (
  browserWindow: SpeechRecognitionWindow = window,
): SpeechRecognitionConstructor | null =>
  browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;

const finalSpeechTextFromEvent = (event: SpeechRecognitionEvent): string =>
  Array.from(event.results)
    .slice(event.resultIndex)
    .filter((result) => result.isFinal && result.length > 0)
    .map((result) => result[0]?.transcript.trim() ?? '')
    .filter((text) => text.length > 0)
    .join(' ');

type RoutineFormState = {
  readonly name: string;
  readonly enabled: boolean;
  readonly kind: RoutineKind;
  readonly cronExpression: string;
  readonly runAt: string;
  readonly presetId: string;
  readonly modelId: string;
  readonly modeId: string;
  readonly attachments: readonly UploadedAttachment[];
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
  attachments: [],
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
  attachments: routine.sendConfig.attachments ?? [],
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
    attachments: [...state.attachments],
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

const submitKeyBindingChoices = [
  {
    value: 'mod-enter',
    label: 'Cmd/Ctrl + Enter',
    description: 'Enter は改行として使います。',
  },
  {
    value: 'enter',
    label: 'Enter',
    description: 'Shift + Enter で改行します。',
  },
] as const satisfies readonly {
  readonly value: AppSubmitKeyBinding;
  readonly label: string;
  readonly description: string;
}[];

const languageChoices = [
  { value: 'ja', labelKey: 'settings.language.options.ja' },
  { value: 'en', labelKey: 'settings.language.options.en' },
] as const satisfies readonly {
  readonly value: AppLanguage;
  readonly labelKey: 'settings.language.options.ja' | 'settings.language.options.en';
}[];

const parseAppLanguage = (value: string): AppLanguage => (value === 'en' ? 'en' : 'ja');

const parseAppSubmitKeyBinding = (value: string): AppSubmitKeyBinding =>
  value === 'enter' ? 'enter' : 'mod-enter';

const submitKeyBindingLabel = (value: AppSubmitKeyBinding): string =>
  submitKeyBindingChoices.find((choice) => choice.value === value)?.label ?? value;

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
  return [{ id: trimmed, name: trimmed, description: 'Saved mode preference' }, ...options];
};

const routineOptionLabel = (option: ModelOption | ModeOption): string =>
  option.name === option.id ? option.name : `${option.name} (${option.id})`;

const routineSelectContentClassName = 'duration-0 data-open:animate-none data-closed:animate-none';

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
  readonly toolbarTrailing?: ReactNode;
}> = ({ disabled, onPromptReady, presetId, projectId, prompt, toolbarTrailing }) => {
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
      toolbarTrailing={toolbarTrailing}
    />
  );
};

const RoutineModelModeFields: FC<{
  readonly formState: RoutineFormState;
  readonly projectId: string;
  readonly setFormState: (update: (current: RoutineFormState) => RoutineFormState) => void;
}> = ({ formState, projectId, setFormState }) => {
  const { t } = useTranslation();
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
        <Label htmlFor="routine-model">{t('routines.model')}</Label>
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
            <SelectValue
              placeholder={
                modelOptions.length === 0 ? t('routines.noModelChoices') : t('common.default')
              }
            />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} className={routineSelectContentClassName}>
            <SelectItem value={routineDefaultSelectValue}>{t('common.default')}</SelectItem>
            {modelOptions.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {routineOptionLabel(model)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="routine-mode">{t('routines.mode')}</Label>
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
            <SelectValue
              placeholder={
                modeOptions.length === 0 ? t('routines.noModeChoices') : t('common.default')
              }
            />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} className={routineSelectContentClassName}>
            <SelectItem value={routineDefaultSelectValue}>{t('common.default')}</SelectItem>
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
  readonly isUploadingAttachments: boolean;
  readonly mode: 'create' | 'edit';
  readonly onCancel: () => void;
  readonly onAttachFiles: (files: readonly File[]) => Promise<void>;
  readonly onRemoveAttachment: (attachmentId: string) => void;
  readonly onSubmit: (prompt: string) => void;
  readonly projectId: string;
  readonly selectableProviders: readonly AgentPreset[];
  readonly setFormState: (update: (current: RoutineFormState) => RoutineFormState) => void;
}> = ({
  formError,
  formState,
  isMutating,
  isUploadingAttachments,
  mode,
  onAttachFiles,
  onCancel,
  onRemoveAttachment,
  onSubmit,
  projectId,
  selectableProviders,
  setFormState,
}) => {
  const promptReaderRef = useRef<(() => string) | null>(null);
  const attachFileInputRef = useRef<HTMLInputElement | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [isListeningToSpeech, setIsListeningToSpeech] = useState(false);
  const handlePromptReady = useCallback((readValue: () => string) => {
    promptReaderRef.current = readValue;
  }, []);
  const canSubmit =
    formState.name.trim().length > 0 &&
    formState.presetId.trim().length > 0 &&
    (formState.kind === 'cron'
      ? formState.cronExpression.trim().length > 0
      : formState.runAt.trim().length > 0);
  const isFormDisabled = isMutating || isUploadingAttachments;

  const handleAttachFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = input.files === null ? [] : [...input.files];
    if (files.length === 0) {
      return;
    }

    void onAttachFiles(files).finally(() => {
      input.value = '';
    });
  };

  const handleToggleSpeechInput = () => {
    if (isFormDisabled) {
      return;
    }
    const currentRecognition = speechRecognitionRef.current;
    if (isListeningToSpeech) {
      currentRecognition?.stop();
      setIsListeningToSpeech(false);
      return;
    }

    const SpeechRecognition = resolveSpeechRecognitionConstructor();
    if (SpeechRecognition === null) {
      toast.error('このブラウザは音声入力に対応していません');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language.length > 0 ? navigator.language : 'ja-JP';
    recognition.onresult = (event) => {
      const speechText = finalSpeechTextFromEvent(event);
      if (speechText.length === 0) {
        return;
      }
      const currentPrompt = promptReaderRef.current?.() ?? formState.prompt;
      const nextPrompt = appendRichPromptText({ value: currentPrompt, addition: speechText });
      setFormState((current) => ({ ...current, prompt: nextPrompt }));
    };
    recognition.onerror = (event) => {
      setIsListeningToSpeech(false);
      speechRecognitionRef.current = null;
      if (event.error !== 'aborted') {
        toast.error(event.message.length > 0 ? event.message : '音声入力に失敗しました');
      }
    };
    recognition.onend = () => {
      setIsListeningToSpeech(false);
      speechRecognitionRef.current = null;
    };

    speechRecognitionRef.current = recognition;
    setIsListeningToSpeech(true);
    try {
      recognition.start();
    } catch {
      speechRecognitionRef.current = null;
      setIsListeningToSpeech(false);
      toast.error('音声入力を開始できませんでした');
    }
  };

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
              <SelectContent alignItemWithTrigger={false} className={routineSelectContentClassName}>
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
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
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
              <SelectContent alignItemWithTrigger={false} className={routineSelectContentClassName}>
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
        </div>

        <Suspense
          fallback={
            <div className="grid min-h-[3.75rem] gap-3 md:grid-cols-2">
              <p className="self-center text-sm text-muted-foreground">Loading choices...</p>
            </div>
          }
        >
          <RoutineModelModeFields
            formState={formState}
            projectId={projectId}
            setFormState={setFormState}
          />
        </Suspense>

        <div className="space-y-2">
          <Label>Prompt</Label>
          {formState.attachments.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {formState.attachments.map((attachment) => (
                <span
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-foreground"
                  key={attachment.attachmentId}
                >
                  <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                  <span className="max-w-48 truncate">{attachment.name}</span>
                  <span className="hidden text-muted-foreground sm:inline">
                    {attachmentContentBlockLabel(attachment)}
                  </span>
                  <button
                    aria-label={`Remove ${attachment.name}`}
                    className="-mr-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    disabled={isFormDisabled}
                    onClick={() => {
                      onRemoveAttachment(attachment.attachmentId);
                    }}
                    type="button"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <input
            className="hidden"
            multiple
            onChange={handleAttachFileInputChange}
            ref={attachFileInputRef}
            type="file"
          />
          <Suspense
            fallback={
              <p className="min-h-28 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Loading commands...
              </p>
            }
          >
            <RoutinePromptField
              disabled={isFormDisabled}
              onPromptReady={handlePromptReady}
              presetId={formState.presetId}
              projectId={projectId}
              prompt={formState.prompt}
              toolbarTrailing={
                <>
                  <Button
                    aria-label="Attach files"
                    disabled={isFormDisabled}
                    onClick={() => {
                      attachFileInputRef.current?.click();
                    }}
                    size="icon-sm"
                    title="Attach files"
                    type="button"
                    variant="ghost"
                  >
                    {isUploadingAttachments ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Paperclip className="size-4" />
                    )}
                  </Button>
                  <Button
                    aria-label={isListeningToSpeech ? 'Stop voice input' : 'Start voice input'}
                    className={cn(
                      isListeningToSpeech
                        ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive'
                        : '',
                    )}
                    disabled={isFormDisabled}
                    onClick={handleToggleSpeechInput}
                    size="icon-sm"
                    title={isListeningToSpeech ? '音声入力を停止' : '音声入力'}
                    type="button"
                    variant="ghost"
                  >
                    <Mic className="size-4" />
                  </Button>
                </>
              }
            />
          </Suspense>
        </div>

        {formError === null ? null : <p className="text-sm text-destructive">{formError}</p>}
      </div>
      <DialogFooter>
        <Button disabled={isFormDisabled} onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button
          disabled={!canSubmit || isFormDisabled}
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
}> = ({ checked, disabled, onCheckedChange }) => {
  const { t } = useTranslation();

  return (
    <button
      aria-checked={checked}
      aria-label={checked ? t('routines.disable') : t('routines.enable')}
      className={[
        'inline-flex h-7 w-12 shrink-0 items-center rounded-full border px-1 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
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
          'size-5 rounded-full bg-background shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
      <span className="sr-only">{checked ? t('common.enabled') : t('common.disabled')}</span>
    </button>
  );
};

export const RoutineSettingsPanel: FC<{ readonly project: Project }> = ({ project }) => {
  const { t } = useTranslation();
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
  const uploadRoutineAttachmentsMutation = useMutation({
    mutationFn: uploadAttachmentsRequest,
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

  const handleAttachRoutineFiles = async (files: readonly File[]) => {
    setFormError(null);
    try {
      const response = await uploadRoutineAttachmentsMutation.mutateAsync(files);
      setFormState((current) => ({
        ...current,
        attachments: [...current.attachments, ...response.attachments],
      }));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Attachment upload failed.');
    }
  };

  const handleRemoveRoutineAttachment = (attachmentId: string) => {
    setFormState((current) => ({
      ...current,
      attachments: current.attachments.filter(
        (attachment) => attachment.attachmentId !== attachmentId,
      ),
    }));
  };

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
    <section className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={handleCreateRoutine} type="button">
          <Plus className="size-4" />
          {t('routines.newRoutine')}
        </Button>
      </div>
      <div className="space-y-5">
        <div className="space-y-3">
          {projectRoutines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('routines.noRoutinesYet')}</p>
          ) : null}
          {projectRoutines.map((routine) => (
            <div
              className="space-y-3 rounded-lg border border-border/70 px-3 py-3"
              key={routine.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{routine.name}</p>
                    <Badge variant={routine.enabled ? 'default' : 'outline'}>
                      {routine.enabled ? t('common.enabled') : t('common.disabled')}
                    </Badge>
                    <Badge variant="secondary">{routine.kind}</Badge>
                    {(routine.sendConfig.attachments ?? []).length > 0 ? (
                      <Badge variant="outline">
                        <Paperclip className="size-3" />
                        {String((routine.sendConfig.attachments ?? []).length)}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {routine.kind === 'cron' ? routine.config.cronExpression : routine.config.runAt}
                  </p>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <p>
                      {t('routines.next')}: {formatOptionalDateTime(routine.nextRunAt)}
                    </p>
                    <p>
                      {t('routines.last')}: {formatOptionalDateTime(routine.lastRunAt)}
                    </p>
                  </div>
                  {routine.lastError === null || routine.lastError === undefined ? null : (
                    <p className="text-xs text-destructive">{routine.lastError}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <RoutineEnabledToggle
                    checked={routine.enabled}
                    disabled={isMutating}
                    onCheckedChange={(enabled) => {
                      void handleToggleRoutine(routine, enabled);
                    }}
                  />
                  <Button
                    aria-label={t('common.edit')}
                    disabled={isMutating}
                    onClick={() => {
                      handleEditRoutine(routine);
                    }}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    aria-label={t('common.delete')}
                    disabled={isMutating}
                    onClick={() => {
                      void handleDeleteRoutine(routine.id);
                    }}
                    size="icon-sm"
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
          <DialogContent className="top-4 max-h-[calc(100svh-2rem)] translate-y-0 overflow-hidden sm:top-1/2 sm:max-w-2xl sm:-translate-y-1/2">
            <DialogHeader>
              <DialogTitle>
                {editingRoutineId === null ? t('routines.newRoutine') : t('routines.editRoutine')}
              </DialogTitle>
              <DialogDescription>{t('routines.dialogDescription')}</DialogDescription>
            </DialogHeader>
            {dialogOpen ? (
              <RoutineDialogBody
                formError={formError}
                formState={formState}
                isMutating={isMutating}
                isUploadingAttachments={uploadRoutineAttachmentsMutation.isPending}
                mode={editingRoutineId === null ? 'create' : 'edit'}
                onAttachFiles={handleAttachRoutineFiles}
                onCancel={handleCancelEdit}
                onRemoveAttachment={handleRemoveRoutineAttachment}
                onSubmit={(prompt) => {
                  void handleSubmit(prompt);
                }}
                projectId={project.id}
                selectableProviders={selectableProviders}
                setFormState={setFormState}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
};

export const ProviderSettingsPanel: FC = () => {
  const { t } = useTranslation();
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
        <CardTitle>{t('providerSettings.title')}</CardTitle>
        <CardDescription>{t('providerSettings.description')}</CardDescription>
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
                      {entry.enabled ? t('common.enabled') : t('common.disabled')}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{entry.preset.description}</p>
                  <span className="block break-all font-mono text-xs text-muted-foreground">
                    {entry.preset.command} {entry.preset.args.join(' ')}
                  </span>
                  {entry.enabled ? (
                    <p className={`text-xs ${providerSummaryToneClassName(summaryHasError)}`}>
                      {isBusy ? t('providerSettings.checking') : providerSummaryText(summary)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t('common.disabled')}</p>
                  )}
                </div>
                {isCustomProvider ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      aria-label={t('providerSettings.editProviderAria', {
                        label: entry.preset.label,
                      })}
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
                      title={t('common.edit')}
                      type="button"
                      variant="ghost"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      aria-label={t('providerSettings.deleteProviderAria', {
                        label: entry.preset.label,
                      })}
                      disabled={isBusy}
                      onClick={() => {
                        void handleDeleteCustomProvider(entry.preset.id);
                      }}
                      size="icon-sm"
                      title={t('common.delete')}
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
                    {isBusy
                      ? t('providerSettings.checking')
                      : entry.enabled
                        ? t('common.disable')
                        : t('common.enable')}
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
          {t('providerSettings.addCustomProvider')}
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
                  ? t('providerSettings.editCustomProviderDialog')
                  : t('providerSettings.addCustomProviderDialog')}
              </DialogTitle>
              <DialogDescription>{t('providerSettings.dialogDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="custom-provider-dialog-name">{t('providerSettings.name')}</Label>
                <Input
                  id="custom-provider-dialog-name"
                  onChange={(event) => {
                    setCustomProviderName(event.target.value);
                  }}
                  placeholder={t('providerSettings.namePlaceholder')}
                  value={customProviderName}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-provider-dialog-command">
                  {t('providerSettings.command')}
                </Label>
                <Input
                  id="custom-provider-dialog-command"
                  onChange={(event) => {
                    setCustomProviderCommandText(event.target.value);
                  }}
                  placeholder={t('providerSettings.commandPlaceholder')}
                  value={customProviderCommandText}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={closeCustomProviderDialog} type="button" variant="outline">
                {t('common.cancel')}
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
                {customProviderDialogState?.mode === 'edit' ? t('common.save') : t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export const AppearanceSettingsPanel: FC = () => {
  const { t } = useTranslation();
  const { preference, resolvedTheme, setPreference } = useTheme();

  return (
    <Card className="app-panel">
      <CardHeader>
        <CardTitle>{t('appearance.title')}</CardTitle>
        <CardDescription>{t('appearance.theme.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
        <div className="space-y-1">
          <Label htmlFor="theme-preference">{t('appearance.theme.label')}</Label>
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

export const ApiConnectionSettingsPanel: FC = () => {
  const { t } = useTranslation();

  const handleSaved = useCallback(() => {
    toast.success(t('apiAuth.saved'));
    window.location.reload();
  }, [t]);

  return (
    <Card className="app-panel">
      <CardHeader>
        <CardTitle>{t('apiAuth.settingsTitle')}</CardTitle>
        <CardDescription>{t('apiAuth.settingsDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ApiAuthForm onSaved={handleSaved} />
      </CardContent>
    </Card>
  );
};

export const LanguageSettingsPanel: FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery({
    queryKey: appSettingsQueryKey,
    queryFn: fetchAppSettings,
  });

  const updateMutation = useMutation({
    mutationFn: updateAppSettingsRequest,
    onSuccess: (response) => {
      queryClient.setQueryData(appSettingsQueryKey, response);
      toast.success(t('settings.language.saved'));
    },
    onError: () => {
      toast.error(t('settings.language.failed'));
    },
  });

  return (
    <Card className="app-panel">
      <CardHeader>
        <CardTitle>{t('settings.language.title')}</CardTitle>
        <CardDescription>{t('settings.language.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
        <div className="space-y-1">
          <Label htmlFor="app-language">{t('settings.language.label')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Select
            disabled={updateMutation.isPending}
            onValueChange={(value) => {
              if (value === null) {
                return;
              }
              updateMutation.mutate({
                language: parseAppLanguage(value),
                submitKeyBinding: data.settings.submitKeyBinding,
              });
            }}
            value={data.settings.language}
          >
            <SelectTrigger className="w-full" id="app-language">
              <SelectValue placeholder={t('settings.language.label')} />
            </SelectTrigger>
            <SelectContent align="end">
              {languageChoices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {t(choice.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {updateMutation.isPending ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export const KeybindingSettingsPanel: FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery({
    queryKey: appSettingsQueryKey,
    queryFn: fetchAppSettings,
  });

  const updateMutation = useMutation({
    mutationFn: updateAppSettingsRequest,
    onSuccess: (response) => {
      queryClient.setQueryData(appSettingsQueryKey, response);
    },
  });

  const updateError =
    updateMutation.error instanceof Error ? updateMutation.error.message : t('common.saveFailed');

  return (
    <Card className="app-panel">
      <CardHeader>
        <CardTitle>{t('keybinding.title')}</CardTitle>
        <CardDescription>{t('keybinding.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
        <div className="space-y-1">
          <Label htmlFor="submit-key-binding">{t('appearance.submitKey.label')}</Label>
          <p className="text-sm text-muted-foreground">{t('appearance.submitKey.description')}</p>
          {updateMutation.isError ? (
            <p className="text-sm text-destructive">{updateError}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Select
            disabled={updateMutation.isPending}
            onValueChange={(value) => {
              if (value === null) {
                return;
              }
              updateMutation.mutate({
                language: data.settings.language,
                submitKeyBinding: parseAppSubmitKeyBinding(value),
              });
            }}
            value={data.settings.submitKeyBinding}
          >
            <SelectTrigger className="w-full" id="submit-key-binding">
              <SelectValue placeholder="Submit">
                {(value) =>
                  typeof value === 'string'
                    ? submitKeyBindingLabel(parseAppSubmitKeyBinding(value))
                    : 'Submit'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end" className="min-w-64">
              {submitKeyBindingChoices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  <div className="flex flex-col">
                    <span>{choice.label}</span>
                    <span className="text-xs text-muted-foreground">{choice.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {updateMutation.isPending ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export const NotificationsSettingsPanel: FC = () => {
  const { t } = useTranslation();
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
      setNotificationError(t('notificationsSettings.systemNotification.unsupportedError'));
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
        setNotificationError(t('notificationsSettings.systemNotification.deniedError'));
        return;
      }
      setNotificationError(t('notificationsSettings.systemNotification.unsupportedError'));
    } finally {
      setIsUpdatingSystemNotifications(false);
    }
  };

  const handlePreviewNotification = async () => {
    const didShowNotification = await showNotificationPreview({
      projectId: 'settings',
      projectName: 'Remote Agent',
      sessionId: 'settings',
      text: t('notificationsSettings.systemNotification.previewText'),
      timestamp: Date.now(),
      url: '/settings',
    });

    if (!didShowNotification) {
      setNotificationError(t('notificationsSettings.systemNotification.previewFailed'));
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
        <CardTitle>{t('notificationsSettings.title')}</CardTitle>
        <CardDescription>{t('notificationsSettings.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Label>{t('notificationsSettings.systemNotification.label')}</Label>
              <Badge variant="outline">{notificationPermission}</Badge>
              <Badge variant={systemNotificationPreference === 'enabled' ? 'default' : 'outline'}>
                {systemNotificationPreference === 'enabled' ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('notificationsSettings.systemNotification.description')}
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
            {t('notificationsSettings.systemNotification.test')}
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="task-completion-sound">
              {t('notificationsSettings.taskCompletionSound.label')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('notificationsSettings.taskCompletionSound.description')}
            </p>
          </div>
          <Select
            onValueChange={(value) => {
              handleTaskCompletionSoundChange(parseTaskCompletionSoundPreference(value));
            }}
            value={taskCompletionSoundPreference}
          >
            <SelectTrigger className="w-full" id="task-completion-sound">
              <SelectValue placeholder={t('notificationsSettings.taskCompletionSound.label')} />
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
            {t('notificationsSettings.taskCompletionSound.preview')}
          </Button>
        </div>
        {notificationPermission === 'denied' ? (
          <p className="text-xs text-muted-foreground">
            {t('notificationsSettings.systemNotification.deniedHint')}
          </p>
        ) : null}
        {notificationError === null ? null : (
          <p className="text-xs text-destructive">{notificationError}</p>
        )}
      </CardContent>
    </Card>
  );
};
