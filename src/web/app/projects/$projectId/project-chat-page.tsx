import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowDown,
  BarChart3,
  FileSymlink,
  History,
  Info,
  Loader2,
  Mic,
  MessageSquareDashed,
  Paperclip,
  PowerOff,
  Send,
  ShieldAlert,
  Square,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FC,
  type ReactNode,
  type UIEventHandler,
} from 'react';
import { toast } from 'sonner';

import {
  parseAcpSseEventJson,
  type AcpSseEvent,
  type AcpPermissionRequest,
  type AgentPreset,
  type AgentModelCatalogResponse,
  type ChatMessage,
  type ChatMessageKind,
  type ModeOption,
  type ModelOption,
  type SessionConfigOption,
  type SessionMessagesResponse,
  type SessionSummary,
  type SessionsResponse,
  type SlashCommand,
  type UploadedAttachment,
  type UserAttachment,
} from '../../../../shared/acp.ts';
import { ChatMarkdown } from '../../../components/chat-markdown.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { ScrollArea } from '../../../components/ui/scroll-area.tsx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select.tsx';
import { ACP_SSE_BROWSER_EVENT } from '../../../lib/api/acp-sse-browser-event.ts';
import {
  cancelSessionRequest,
  createProjectWorktreeRequest,
  createSessionRequest,
  deleteSessionRequest,
  fetchAgentModelCatalog,
  fetchAgentProviders,
  fetchAgentSlashCommands,
  fetchAcpPermissionRequests,
  fetchAppInfo,
  fetchAppSettings,
  fetchProject,
  fetchProjectSettings,
  fetchSessionMessages,
  fetchSessions,
  prepareAgentSessionRequest,
  resolveAcpPermissionRequest,
  sendPromptRequest,
  sendPreparedPromptRequest,
  stopSessionRequest,
  updateProjectModePreferenceRequest,
  updateProjectModelPreferenceRequest,
  updateSessionConfigOptionRequest,
  updateSessionRequest,
  uploadAttachmentsRequest,
} from '../../../lib/api/acp.ts';
import { cn } from '../../../lib/utils.ts';
import { markAppNotificationsReadForSession } from '../../../pwa/notification-center.ts';
import { showAssistantResponseNotification } from '../../../pwa/notifications.ts';
import { appSettingsQueryKey } from '../../settings/queries.ts';
import {
  formatAcpPermissionOptionLabel,
  permissionRequestVisualInputText,
} from './acp-permission-display.pure.ts';
import {
  formatAcpSelectOptionLabel,
  formatAcpSelectValueLabel,
  formatAcpSelectValueInfo,
} from './acp-select-display.pure.ts';
import {
  acpSessionUpdateFromMessage,
  acpToolStatusUpdateFromMessage,
  latestAcpUsageUpdate,
  latestAvailableSlashCommands,
  vscodeFileUri,
} from './acp-session-meta.pure.ts';
import { AcpToolVisualViewBlock } from './acp-tool-use-card.tsx';
import { resolveAcpToolVisualView } from './acp-tool-visual-view.pure.ts';
import { chatMessageClipboardText } from './chat-block-copy.pure.ts';
import { ChatRawEvents } from './chat-raw-events.tsx';
import { isNearScrollBottom, nextUnreadMessageCount } from './chat-scroll.pure.ts';
import {
  attachmentContentBlockLabel,
  appendTranscriptMessage,
  buildDraftSession,
  buildPromptText,
  defaultPresetId,
  type DraftSessionRedirectRequest,
  draftSessionTranscriptKey,
  draftSessionTranscriptKeyForGeneration,
  moveTranscript,
  resolveSessionListTitle,
  shouldRedirectDraftSessionStart,
  shouldShowConversationLoading,
} from './chat-state.pure.ts';
import { CopyBlockButton } from './copy-block-button.tsx';
import { shouldShowMessageCopyButton } from './message-copy-display.pure.ts';
import { ProjectMenuContent } from './project-menu-content.tsx';
import {
  sessionStatusBadgeClassName,
  sessionStatusLabel,
  sessionTimestamp,
  sortSessionsNewestFirst,
} from './project-session-list.pure.ts';
import {
  agentModelCatalogQueryKey,
  agentProvidersQueryKey,
  agentSlashCommandsQueryKey,
  acpPermissionRequestsQueryKey,
  appInfoQueryKey,
  projectQueryKey,
  projectSettingsQueryKey,
  sessionMessagesQueryKey,
  sessionsQueryKey,
} from './queries.ts';
import { ReviewDialogButton } from './review-dialog.tsx';
import { appendRichPromptText } from './rich-prompt-editor.pure.ts';
import { RichPromptEditor } from './rich-prompt-editor.tsx';
import {
  filterDisplayableRawEvents,
  isToolOnlyTranscriptMessage,
  shouldDisplayTranscriptMessage,
} from './transcript-display.pure.ts';
import { mergeToolCallResultMessages } from './transcript-tool-merge.pure.ts';
import { createChatMessage, type TranscriptMap } from './types.ts';
import { useLoadSessionDialog } from './use-load-session-dialog.tsx';
import {
  canSendWithDraftWorktreeState,
  draftWorktreeNameError,
  normalizeDraftWorktreeName,
  shouldUsePreparedDraftSession as shouldUsePreparedDraftSessionForWorktree,
} from './worktree-draft-session.pure.ts';

/** claude-code-viewer の会話カラムと同型（全幅行のうち sm:90% / max-w-3xl で寄せ） */
const CONVERSATION_COLUMN_CLASS = 'w-full min-w-0 sm:w-[90%] md:w-[85%] max-w-3xl lg:max-w-4xl';
const createDefaultWorktreeName = (): string => `wt-${nanoid(8)}`;

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

const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

const usagePercentValue = ({ size, used }: { readonly used: number; readonly size: number }) => {
  if (size <= 0) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round((Math.max(0, used) / size) * 100)));
};

const UsageProgress: FC<{
  readonly cost?: { readonly amount: number; readonly currency: string } | null;
  readonly size: number;
  readonly used: number;
}> = ({ cost, size, used }) => {
  const percent = usagePercentValue({ size, used });
  const percentLabel = percent === null ? 'unknown' : `${String(percent)}%`;
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1.5 text-xs">
      <BarChart3 className="size-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
      <span className="shrink-0 font-medium text-emerald-700 dark:text-emerald-300">Usage</span>
      <div
        aria-label={`Context usage ${percentLabel}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent ?? undefined}
        className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-emerald-950/10 dark:bg-emerald-50/10"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-emerald-600 transition-[width] dark:bg-emerald-400"
          style={{ width: `${String(percent ?? 0)}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{percentLabel}</span>
      <span className="min-w-0 shrink truncate text-[11px] text-muted-foreground">
        {used.toLocaleString()} / {size.toLocaleString()}
      </span>
      {cost === null || cost === undefined ? null : (
        <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
          {cost.amount.toLocaleString()} {cost.currency}
        </span>
      )}
    </div>
  );
};

const AcpSessionMetaMessage: FC<{ readonly cwd: string; readonly message: ChatMessage }> = ({
  cwd,
  message,
}) => {
  const update = acpSessionUpdateFromMessage(message);
  if (update?.sessionUpdate === 'usage_update') {
    return <UsageProgress cost={update.cost} size={update.size} used={update.used} />;
  }

  if (update?.sessionUpdate === 'available_commands_update') {
    return (
      <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2 text-xs">
        <div className="mb-1 font-medium text-sky-700 dark:text-sky-300">Slash commands</div>
        <div className="flex flex-wrap gap-1.5">
          {update.availableCommands.map((command) => (
            <span className="rounded bg-background/70 px-1.5 py-0.5 font-mono" key={command.name}>
              /{command.name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (update?.sessionUpdate === 'session_info_update') {
    return (
      <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 px-3 py-2 text-xs">
        <div className="mb-1 font-medium text-violet-700 dark:text-violet-300">
          Session info updated
        </div>
        <div className="grid gap-1 text-muted-foreground sm:grid-cols-2">
          <span>Title: {update.title ?? 'unchanged'}</span>
          <span>Updated: {update.updatedAt ?? 'unchanged'}</span>
        </div>
      </div>
    );
  }

  const toolUpdate = acpToolStatusUpdateFromMessage(message);
  if (toolUpdate !== null) {
    return (
      <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 px-3 py-2 text-xs">
        <div className="mb-1 flex min-w-0 items-center gap-1.5 font-medium text-blue-700 dark:text-blue-300">
          <FileSymlink className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{toolUpdate.title ?? toolUpdate.toolCallId}</span>
          {toolUpdate.status === null || toolUpdate.status === undefined ? null : (
            <span className="rounded bg-background/70 px-1.5 py-0.5 font-normal">
              {toolUpdate.status}
            </span>
          )}
        </div>
        {toolUpdate.locations !== null &&
        toolUpdate.locations !== undefined &&
        toolUpdate.locations.length > 0 ? (
          <div className="space-y-1">
            {toolUpdate.locations.map((location) => (
              <a
                className="flex min-w-0 items-center gap-1.5 rounded bg-background/70 px-2 py-1 font-mono text-[11px] text-blue-700 hover:underline dark:text-blue-300"
                href={vscodeFileUri({ cwd, path: location.path, line: location.line })}
                key={`${location.path}:${String(location.line ?? '')}`}
              >
                <FileSymlink className="size-3 shrink-0" />
                <span className="min-w-0 truncate">
                  {location.path}
                  {location.line === null || location.line === undefined
                    ? ''
                    : `:${String(location.line)}`}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground">No locations</div>
        )}
      </div>
    );
  }

  return null;
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

const dataUrlFromImageAttachment = (attachment: UserAttachment): string =>
  `data:${attachment.source.media_type};base64,${attachment.source.data}`;

const userAttachmentsFromUploaded = (
  attachments: readonly UploadedAttachment[],
): readonly UserAttachment[] => {
  return attachments.reduce<readonly UserAttachment[]>((items, attachment) => {
    if (attachment.source === undefined) {
      return items;
    }

    return [
      ...items,
      {
        type: 'image',
        source: attachment.source,
        attachmentId: attachment.attachmentId,
        name: attachment.name,
        sizeInBytes: attachment.sizeInBytes,
      },
    ];
  }, []);
};

const UserAttachmentPreview: FC<{ readonly attachments: readonly UserAttachment[] }> = ({
  attachments,
}) => {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(9rem,14rem))] gap-2">
      {attachments.map((attachment, index) => {
        const key =
          attachment.attachmentId ?? `${attachment.source.media_type}-${index.toString()}`;
        return (
          <figure className="min-w-0 overflow-hidden rounded-lg border bg-background" key={key}>
            <img
              alt={attachment.name ?? 'Attached image'}
              className="aspect-video w-full bg-muted object-cover"
              loading="lazy"
              src={dataUrlFromImageAttachment(attachment)}
            />
            {attachment.name === undefined ? null : (
              <figcaption className="truncate px-2 py-1.5 text-xs text-muted-foreground">
                {attachment.name}
              </figcaption>
            )}
          </figure>
        );
      })}
    </div>
  );
};

const TranscriptMessageBody: FC<{ readonly cwd: string; readonly message: ChatMessage }> = ({
  cwd,
  message,
}) => {
  const displayEvents = filterDisplayableRawEvents(message.rawEvents);
  if (message.rawJson.type === 'x-error') {
    return (
      <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-900 dark:text-red-100">
        <div className="font-medium">Invalid stored message: {message.id}</div>
        <div className="mt-1">sourceKind: {message.rawJson.sourceKind}</div>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">
          {message.rawJson.rawJsonText}
        </pre>
      </div>
    );
  }
  if (message.role === 'user') {
    const text = message.rawJson.type === 'user' ? message.rawJson.text : message.text;
    const attachments = message.rawJson.type === 'user' ? (message.rawJson.attachments ?? []) : [];
    return (
      <div>
        {text.trim().length === 0 ? null : <ChatMarkdown>{text}</ChatMarkdown>}
        <UserAttachmentPreview attachments={attachments} />
      </div>
    );
  }
  const k: ChatMessageKind = message.kind ?? 'legacy_assistant_turn';
  if (k === 'raw_meta') {
    return (
      <div className="flex flex-col gap-2">
        <AcpSessionMetaMessage cwd={cwd} message={message} />
        {displayEvents.length > 0 ? <ChatRawEvents events={message.rawEvents} /> : null}
      </div>
    );
  }
  if (k === 'legacy_assistant_turn') {
    return (
      <div className="flex w-full flex-col gap-3">
        {displayEvents.length > 0 ? <ChatRawEvents events={message.rawEvents} /> : null}
        {message.text.length > 0 ? (
          <div className="w-full px-0.5 text-foreground sm:px-1">
            <ChatMarkdown>{message.text}</ChatMarkdown>
          </div>
        ) : null}
      </div>
    );
  }
  if (k === 'reasoning' && message.text.length > 0) {
    const text = message.rawJson.type === 'reasoning' ? message.rawJson.text : message.text;
    return <ChatRawEvents events={[{ type: 'reasoning', text, rawText: text }]} />;
  }
  if (k === 'assistant_text' || k === 'tool_input') {
    const text =
      message.rawJson.type === 'assistant_text' || message.rawJson.type === 'tool_input'
        ? message.rawJson.text
        : message.text;
    return text.length > 0 ? (
      <div className="text-foreground">
        <ChatMarkdown>{text}</ChatMarkdown>
      </div>
    ) : null;
  }
  if (k === 'tool_call' || k === 'tool_result' || k === 'tool_error') {
    return displayEvents.length > 0 ? <ChatRawEvents events={message.rawEvents} /> : null;
  }
  return (
    <div className="flex flex-col gap-2">
      {message.text.length > 0 ? (
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border/40 bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
          {message.text}
        </pre>
      ) : null}
      {displayEvents.length > 0 ? <ChatRawEvents events={message.rawEvents} /> : null}
    </div>
  );
};

const presetFrom = ({
  presetId,
  presets,
}: {
  readonly presetId: string | null | undefined;
  readonly presets: readonly AgentPreset[];
}): AgentPreset | null => {
  if (presetId === null || presetId === undefined) {
    return null;
  }

  return presets.find((preset) => preset.id === presetId) ?? null;
};

const modelSelectLabelFromPreset = (preset: AgentPreset | null): string =>
  preset?.modelSelectLabel ?? 'Model';

const modeSelectLabelFromPreset = (preset: AgentPreset | null): string =>
  preset?.modeSelectLabel ?? 'Mode';

const genericConfigOptionValueLabel = (
  option: SessionConfigOption,
  value: string | null | undefined,
): string => option.values.find((candidate) => candidate.value === value)?.name ?? option.name;

const genericConfigOptionValueInfo = (
  option: SessionConfigOption,
  value: string | null | undefined,
): string | null => {
  const selectedValue = option.values.find((candidate) => candidate.value === value);
  return selectedValue?.description ?? option.description ?? null;
};

const orderModelOptions = ({
  favoriteModelIds,
  lastUsedModelId,
  options,
}: {
  readonly options: readonly ModelOption[];
  readonly favoriteModelIds: ReadonlySet<string>;
  readonly lastUsedModelId: string | null;
}): readonly ModelOption[] =>
  [...options].sort((left, right) => {
    const leftFavorite = favoriteModelIds.has(left.id);
    const rightFavorite = favoriteModelIds.has(right.id);
    if (leftFavorite !== rightFavorite) {
      return leftFavorite ? -1 : 1;
    }
    if (left.id === lastUsedModelId || right.id === lastUsedModelId) {
      return left.id === lastUsedModelId ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

const modeOptionsWithSavedPreferences = ({
  currentModeId,
  lastUsedModeId,
  options,
}: {
  readonly currentModeId: string | null;
  readonly lastUsedModeId: string | null;
  readonly options: readonly ModeOption[];
}): readonly ModeOption[] => {
  const missingIds = [lastUsedModeId, currentModeId].filter(
    (modeId): modeId is string =>
      modeId !== null &&
      modeId.trim().length > 0 &&
      !options.some((option) => option.id === modeId),
  );
  const uniqueMissingIds = [...new Set(missingIds)];
  return [
    ...uniqueMissingIds.map((modeId) => ({
      id: modeId,
      name: modeId,
      description: 'Saved mode preference',
    })),
    ...options,
  ];
};

const AcpSelectItemLabel: FC<{
  readonly children: string;
}> = ({ children }) => (
  <span className="flex min-w-0 flex-1 items-center gap-1.5">
    <span className="min-w-0 truncate">{children}</span>
  </span>
);

const AcpSelectValueInfo: FC<{
  readonly info: string | null;
}> = ({ info }) => {
  if (info === null) {
    return null;
  }

  return (
    <Button
      aria-label={info}
      className="size-8 shrink-0 text-muted-foreground"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toast.info(info);
      }}
      size="icon"
      title={info}
      type="button"
      variant="ghost"
    >
      <Info aria-hidden="true" className="size-3.5" />
    </Button>
  );
};

const AcpModelSelectItem: FC<{
  readonly disabled?: boolean;
  readonly favorite: boolean;
  readonly model: ModelOption;
  readonly onToggleFavorite: (modelId: string, favorite: boolean) => void;
  readonly options: readonly ModelOption[];
  readonly presetId: string | null | undefined;
}> = ({ disabled = false, favorite, model, onToggleFavorite, options, presetId }) => (
  <SelectItem
    className="pr-2 pl-7 [&>span:last-child]:right-auto [&>span:last-child]:left-2"
    value={model.id}
  >
    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
      <AcpSelectItemLabel>
        {formatAcpSelectOptionLabel({
          kind: 'model',
          option: model,
          options,
          presetId,
        })}
      </AcpSelectItemLabel>
      <button
        aria-label={favorite ? 'Unpin model' : 'Pin model'}
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          favorite ? 'text-amber-500 hover:text-amber-500' : '',
        )}
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleFavorite(model.id, favorite);
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        title={favorite ? 'Pinned から外す' : 'Pinned に追加'}
        type="button"
      >
        <Star aria-hidden="true" className={cn('size-3.5', favorite ? 'fill-current' : '')} />
      </button>
    </span>
  </SelectItem>
);

const AcpModelSelectItems: FC<{
  readonly disabled?: boolean;
  readonly favoriteModelIds: ReadonlySet<string>;
  readonly onToggleFavorite: (modelId: string, favorite: boolean) => void;
  readonly options: readonly ModelOption[];
  readonly presetId: string | null | undefined;
}> = ({ disabled = false, favoriteModelIds, onToggleFavorite, options, presetId }) => {
  const pinned = options.filter((model) => favoriteModelIds.has(model.id));
  const unpinned = options.filter((model) => !favoriteModelIds.has(model.id));

  const renderItem = (model: ModelOption) => (
    <AcpModelSelectItem
      disabled={disabled}
      favorite={favoriteModelIds.has(model.id)}
      key={model.id}
      model={model}
      onToggleFavorite={onToggleFavorite}
      options={options}
      presetId={presetId}
    />
  );

  if (pinned.length === 0) {
    return <>{unpinned.map(renderItem)}</>;
  }

  return (
    <>
      <SelectGroup>
        <SelectLabel>Pinned</SelectLabel>
        {pinned.map(renderItem)}
      </SelectGroup>
      {unpinned.length > 0 ? (
        <>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>All models</SelectLabel>
            {unpinned.map(renderItem)}
          </SelectGroup>
        </>
      ) : null}
    </>
  );
};

const LoadingConversation: FC = () => (
  <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-card/35 px-5 py-8 text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin" />
    <span>会話を読み込んでいます</span>
  </div>
);

const permissionOptionVariant = (
  kind: AcpPermissionRequest['options'][number]['kind'],
): 'default' | 'destructive' | 'outline' =>
  kind === 'reject_once' || kind === 'reject_always'
    ? 'destructive'
    : kind === 'allow_once'
      ? 'default'
      : 'outline';

const permissionRequestToolVisual = (request: AcpPermissionRequest) => {
  const inputText = permissionRequestVisualInputText(request);
  if (inputText === null) {
    return null;
  }

  return resolveAcpToolVisualView({
    type: 'tool',
    key: `permission-${request.id}`,
    toolCallId: request.toolCallId,
    call: {
      type: 'toolCall',
      toolCallId: request.toolCallId,
      toolName: request.title ?? request.kind ?? 'permission request',
      inputText,
      rawText: '',
    },
    result: null,
    error: null,
  });
};

const PermissionRequestPanel: FC<{
  readonly disabled: boolean;
  readonly request: AcpPermissionRequest;
  readonly onResolve: (requestId: string, optionId: string | null) => void;
}> = ({ disabled, request, onResolve }) => {
  const visualCandidate = permissionRequestToolVisual(request);
  const visual =
    visualCandidate?.kind === 'terminal' && visualCandidate.command.trim().length === 0
      ? null
      : visualCandidate;

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-3', CONVERSATION_COLUMN_CLASS)}>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">承認が必要です</p>
            {visual === null || visual.kind !== 'terminal' ? (
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {request.title ?? request.toolCallId}
              </p>
            ) : null}
            {visual !== null ? (
              <div className="mt-3">
                <AcpToolVisualViewBlock
                  defaultOpen={visual.kind === 'diff' || visual.kind === 'file-read'}
                  detailText={request.rawInputText ?? request.title ?? request.toolCallId}
                  title={request.title ?? request.kind ?? request.toolCallId}
                  visual={visual}
                />
              </div>
            ) : request.rawInputText !== null && request.rawInputText !== undefined ? (
              <pre className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border/50 bg-background/70 px-2.5 py-2 text-xs text-muted-foreground">
                {request.rawInputText}
              </pre>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {request.options.map((option) => (
            <Button
              disabled={disabled}
              key={option.id}
              onClick={() => {
                onResolve(request.id, option.id);
              }}
              size="sm"
              type="button"
              variant={permissionOptionVariant(option.kind)}
            >
              {formatAcpPermissionOptionLabel(option)}
            </Button>
          ))}
          <Button
            disabled={disabled}
            onClick={() => {
              onResolve(request.id, null);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

const FieldControl: FC<{
  readonly className?: string;
  readonly htmlFor: string;
  readonly label: string;
  readonly children: ReactNode;
}> = ({ className, htmlFor, label, children }) => (
  <div className={cn('min-w-0', className)}>
    <Label className="sr-only" htmlFor={htmlFor}>
      {label}
    </Label>
    {children}
  </div>
);

const MODEL_SELECT_CONTENT_CLASS = 'w-[min(90vw,32rem)] min-w-[min(90vw,32rem)]';
const FORM_SELECT_FIELD_CLASS = 'min-w-0 flex-[0_1_auto]';
const FORM_SELECT_ROW_CLASS = 'inline-flex max-w-full items-center gap-1.5';
const FORM_SELECT_TRIGGER_CLASS = 'max-w-full min-w-0';

/** useSuspenseQuery 必須のため、下書き時のみマウントしてカタログを state に反映する。 */
const DraftAgentModelCatalogLoader: FC<{
  readonly projectId: string;
  readonly presetId: string;
  readonly onReady: (catalog: AgentModelCatalogResponse) => void;
}> = ({ projectId, presetId, onReady }) => {
  const { data } = useSuspenseQuery({
    queryKey: agentModelCatalogQueryKey(projectId, presetId),
    queryFn: () => fetchAgentModelCatalog({ projectId, presetId }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    onReady(data);
  }, [data, onReady]);

  return null;
};

const SlashCommandsLoader: FC<{
  readonly projectId: string;
  readonly presetId: string;
  readonly scopeKey: string;
  readonly onReady: (scopeKey: string, commands: readonly SlashCommand[]) => void;
}> = ({ projectId, presetId, scopeKey, onReady }) => {
  const { data } = useSuspenseQuery({
    queryKey: agentSlashCommandsQueryKey(projectId, presetId),
    queryFn: () =>
      fetchAgentSlashCommands({
        projectId,
        presetId,
      }),
    staleTime: 60_000,
  });

  useEffect(() => {
    onReady(scopeKey, data.commands);
  }, [data.commands, onReady, scopeKey]);

  return null;
};

const SessionMessagesHydrator: FC<{
  readonly sessionId: string;
  readonly onHydrated: (sessionId: string, messages: readonly ChatMessage[]) => void;
}> = ({ sessionId, onHydrated }) => {
  const { data, dataUpdatedAt } = useSuspenseQuery({
    queryKey: sessionMessagesQueryKey(sessionId),
    queryFn: () => fetchSessionMessages(sessionId),
  });

  useLayoutEffect(() => {
    onHydrated(sessionId, data.messages);
  }, [data.messages, dataUpdatedAt, onHydrated, sessionId]);

  return null;
};

export const ProjectChatPage: FC<{
  readonly projectId: string;
  readonly sessionId: string | null;
}> = ({ projectId, sessionId }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: '/projects/$projectId' });

  const { data: projectData } = useSuspenseQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
  });
  const { data: projectSettingsData } = useSuspenseQuery({
    queryKey: projectSettingsQueryKey(projectId),
    queryFn: () => fetchProjectSettings(projectId),
  });
  const { data: appInfoData } = useSuspenseQuery({
    queryKey: appInfoQueryKey,
    queryFn: fetchAppInfo,
  });
  const { data: appSettingsData } = useSuspenseQuery({
    queryKey: appSettingsQueryKey,
    queryFn: fetchAppSettings,
  });
  const { data: providerData } = useSuspenseQuery({
    queryKey: agentProvidersQueryKey,
    queryFn: fetchAgentProviders,
  });
  const { data: sessionsData } = useSuspenseQuery({
    queryKey: sessionsQueryKey,
    queryFn: fetchSessions,
  });
  const { data: permissionRequestsData } = useSuspenseQuery({
    queryKey: acpPermissionRequestsQueryKey,
    queryFn: fetchAcpPermissionRequests,
  });

  const project = projectData.project;
  const projectSettings = projectSettingsData.settings;
  const appSettings = appSettingsData.settings;
  const selectablePresets = useMemo(
    () => providerData.providers.filter((entry) => entry.enabled).map((entry) => entry.preset),
    [providerData.providers],
  );
  const preferredPresetId = defaultPresetId(selectablePresets);

  const [draftPresetId, setDraftPresetId] = useState('');
  const [draftModelId, setDraftModelId] = useState<string | null>(null);
  const [draftModeId, setDraftModeId] = useState<string | null>(null);
  const [useDraftWorktree, setUseDraftWorktree] = useState(false);
  const [draftWorktreeName, setDraftWorktreeName] = useState(createDefaultWorktreeName);
  const [pendingTuningModelId, setPendingTuningModelId] = useState<string | null>(null);
  const [pendingTuningModeId, setPendingTuningModeId] = useState<string | null>(null);
  const promptReaderRef = useRef<() => string>(() => '');
  const [promptExternalValue, setPromptExternalValue] = useState({
    revision: 0,
    value: '',
  });
  const [transcripts, setTranscripts] = useState<TranscriptMap>({});
  const [attachedFiles, setAttachedFiles] = useState<readonly UploadedAttachment[]>([]);
  const [awaitingAssistantTranscriptKeys, setAwaitingAssistantTranscriptKeys] = useState<
    readonly string[]
  >([]);
  const [isListeningToSpeech, setIsListeningToSpeech] = useState(false);
  const [probedModelCatalog, setProbedModelCatalog] = useState<AgentModelCatalogResponse | null>(
    null,
  );
  const [slashCommandsResult, setSlashCommandsResult] = useState<{
    readonly scopeKey: string;
    readonly commands: readonly SlashCommand[];
  } | null>(null);
  const [selectedSessionModelCatalog, setSelectedSessionModelCatalog] =
    useState<AgentModelCatalogResponse | null>(null);
  const [preparedSessionIdsByScope, setPreparedSessionIdsByScope] = useState<
    Readonly<Record<string, string>>
  >({});
  const [prepareErrorsByScope, setPrepareErrorsByScope] = useState<
    Readonly<Record<string, string>>
  >({});
  const [preparingScopesByKey, setPreparingScopesByKey] = useState<Readonly<Record<string, true>>>(
    {},
  );
  const preparingScopeKeysRef = useRef(new Set<string>());
  const attachFileInputRef = useRef<HTMLInputElement | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chatContentRef = useRef<HTMLDivElement | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastActiveTranscriptKeyRef = useRef<string | null>(null);
  const previousSessionIdRef = useRef<string | null>(sessionId);
  const [draftViewGeneration, setDraftViewGeneration] = useState(0);
  const draftViewGenerationRef = useRef(0);
  const activeTranscriptKeyRef = useRef<string | null>(null);
  const draftSessionRedirectRequestRef = useRef<DraftSessionRedirectRequest | null>(null);
  const previousVisibleMessageCountRef = useRef(0);
  const [isChatFollowingTail, setIsChatFollowingTail] = useState(true);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [messagesBelowScroll, setMessagesBelowScroll] = useState(0);

  const onAgentCatalogReady = useCallback((catalog: AgentModelCatalogResponse) => {
    setProbedModelCatalog(catalog);
  }, []);

  const onSelectedSessionCatalogReady = useCallback((catalog: AgentModelCatalogResponse) => {
    setSelectedSessionModelCatalog(catalog);
  }, []);

  const onSlashCommandsReady = useCallback(
    (scopeKey: string, commands: readonly SlashCommand[]) => {
      setSlashCommandsResult((current) =>
        current?.scopeKey === scopeKey && current.commands === commands
          ? current
          : { scopeKey, commands },
      );
    },
    [],
  );

  const replacePrompt = useCallback((value: string) => {
    setPromptExternalValue((current) => ({
      revision: current.revision + 1,
      value,
    }));
  }, []);

  const handleInsertReviewPrompt = useCallback(
    (markdown: string) => {
      replacePrompt(appendRichPromptText({ value: promptReaderRef.current(), addition: markdown }));
    },
    [replacePrompt],
  );

  const handlePromptValueReaderReady = useCallback((readValue: () => string) => {
    promptReaderRef.current = readValue;
  }, []);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.abort();
    };
  }, []);

  useLayoutEffect(() => {
    const previousSessionId = previousSessionIdRef.current;
    if (previousSessionId !== null && sessionId === null) {
      const nextGeneration = draftViewGenerationRef.current + 1;
      draftViewGenerationRef.current = nextGeneration;
      setDraftViewGeneration(nextGeneration);
      setDraftWorktreeName(createDefaultWorktreeName());
    }
    previousSessionIdRef.current = sessionId;
  }, [sessionId]);

  const projectSessions = useMemo(
    () =>
      sortSessionsNewestFirst(
        sessionsData.sessions.filter((session) => session.projectId === projectId),
      ),
    [projectId, sessionsData.sessions],
  );
  const {
    canLoadSessions,
    dialog: loadSessionDialog,
    openLoadSessionDialog,
  } = useLoadSessionDialog({
    projectId,
    providers: providerData.providers,
    workingDirectory: projectData.project.workingDirectory,
  });
  /** サイドバー用は `projectSessions` だが、URL の `session-id` との対応づけは全セッションから行う。 */
  const selectedSession =
    sessionId === null
      ? null
      : (projectSessions.find((s) => s.sessionId === sessionId) ??
        sessionsData.sessions.find((s) => s.sessionId === sessionId) ??
        null);
  const shouldUseDraftSession = sessionId === null;
  const reviewSessionId = selectedSession?.sessionId ?? `project:${projectId}`;

  useEffect(() => {
    if (sessionId !== null) {
      markAppNotificationsReadForSession(sessionId);
    }
  }, [sessionId]);

  const activePresetId = draftPresetId.length > 0 ? draftPresetId : preferredPresetId;
  const draftSession = useMemo(
    () =>
      buildDraftSession({
        cwd: project.workingDirectory,
        presetId: activePresetId,
        presets: selectablePresets,
      }),
    [activePresetId, project.workingDirectory, selectablePresets],
  );
  const activePreset = presetFrom({
    presetId: activePresetId,
    presets: appInfoData.agentPresets,
  });
  const slashCommandPresetId = selectedSession?.presetId ?? activePresetId;
  const slashCommandScopeKey = `${projectId}\0${slashCommandPresetId}`;
  const slashCommands =
    slashCommandsResult?.scopeKey === slashCommandScopeKey ? slashCommandsResult.commands : [];
  const selectedSessionPreset = presetFrom({
    presetId: selectedSession?.presetId,
    presets: appInfoData.agentPresets,
  });
  const draftModelSelectLabel = modelSelectLabelFromPreset(activePreset);
  const draftModeSelectLabel = modeSelectLabelFromPreset(activePreset);
  const sessionModelSelectLabel = modelSelectLabelFromPreset(selectedSessionPreset);
  const sessionModeSelectLabel = modeSelectLabelFromPreset(selectedSessionPreset);
  const activePresetModelPreferences = useMemo(
    () => projectSettings.modelPreferences.filter((entry) => entry.presetId === activePresetId),
    [activePresetId, projectSettings.modelPreferences],
  );
  const activePresetModePreferences = useMemo(
    () => projectSettings.modePreferences.filter((entry) => entry.presetId === activePresetId),
    [activePresetId, projectSettings.modePreferences],
  );
  const selectedSessionModelPreferences = useMemo(
    () =>
      projectSettings.modelPreferences.filter(
        (entry) => entry.presetId === selectedSession?.presetId,
      ),
    [projectSettings.modelPreferences, selectedSession?.presetId],
  );
  const activePresetFavoriteModelIds = useMemo(
    () =>
      new Set(
        activePresetModelPreferences
          .filter((entry) => entry.isFavorite)
          .map((entry) => entry.modelId),
      ),
    [activePresetModelPreferences],
  );
  const selectedSessionFavoriteModelIds = useMemo(
    () =>
      new Set(
        selectedSessionModelPreferences
          .filter((entry) => entry.isFavorite)
          .map((entry) => entry.modelId),
      ),
    [selectedSessionModelPreferences],
  );
  const activePresetLastUsedModelId = useMemo(
    () =>
      activePresetModelPreferences
        .filter((entry) => entry.lastUsedAt !== null && entry.lastUsedAt !== undefined)
        .sort((left, right) => (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? ''))[0]
        ?.modelId ?? null,
    [activePresetModelPreferences],
  );
  const activePresetLastUsedModeId = useMemo(
    () =>
      activePresetModePreferences
        .filter((entry) => entry.lastUsedAt !== null && entry.lastUsedAt !== undefined)
        .sort((left, right) => (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? ''))[0]
        ?.modeId ?? null,
    [activePresetModePreferences],
  );

  const draftCatalogScopeKey = `${projectId}\0${activePresetId}`;
  const preparedSessionScopeKey = `${projectId}\0${activePresetId}\0${project.workingDirectory}`;
  const shouldUsePreparedDraftSession = shouldUsePreparedDraftSessionForWorktree({
    shouldUseDraftSession,
    useDraftWorktree,
  });
  const trimmedDraftWorktreeName = normalizeDraftWorktreeName(draftWorktreeName);
  const draftWorktreeValidationError =
    shouldUseDraftSession && useDraftWorktree ? draftWorktreeNameError(draftWorktreeName) : null;

  useEffect(() => {
    if (!shouldUseDraftSession) {
      setProbedModelCatalog(null);
    }
  }, [shouldUseDraftSession]);

  useLayoutEffect(() => {
    if (shouldUseDraftSession) {
      setProbedModelCatalog(null);
    }
  }, [draftCatalogScopeKey, shouldUseDraftSession]);

  useEffect(() => {
    if (!shouldUsePreparedDraftSession || activePresetId.length === 0) {
      return;
    }
    if (preparedSessionIdsByScope[preparedSessionScopeKey] !== undefined) {
      return;
    }
    if (preparingScopeKeysRef.current.has(preparedSessionScopeKey)) {
      return;
    }

    preparingScopeKeysRef.current.add(preparedSessionScopeKey);
    setPreparingScopesByKey((current) => ({
      ...current,
      [preparedSessionScopeKey]: true,
    }));
    setPrepareErrorsByScope((current) => {
      const next = { ...current };
      delete next[preparedSessionScopeKey];
      return next;
    });
    let ignore = false;
    void prepareAgentSessionRequest({
      projectId,
      presetId: activePresetId,
      cwd: project.workingDirectory,
    })
      .then((response) => {
        if (ignore) {
          return;
        }
        setPreparedSessionIdsByScope((current) => ({
          ...current,
          [preparedSessionScopeKey]: response.prepareId,
        }));
      })
      .finally(() => {
        preparingScopeKeysRef.current.delete(preparedSessionScopeKey);
        setPreparingScopesByKey((current) => {
          const next = { ...current };
          delete next[preparedSessionScopeKey];
          return next;
        });
      })
      .catch(() => {
        setPreparedSessionIdsByScope((current) => {
          const next = { ...current };
          delete next[preparedSessionScopeKey];
          return next;
        });
        setPrepareErrorsByScope((current) => ({
          ...current,
          [preparedSessionScopeKey]: 'Provider preconnect failed. Check Settings or agent auth.',
        }));
      });

    return () => {
      ignore = true;
    };
  }, [
    activePresetId,
    preparedSessionIdsByScope,
    preparedSessionScopeKey,
    project.workingDirectory,
    projectId,
    shouldUsePreparedDraftSession,
  ]);

  /** draft の候補は provider catalog table 由来だけを見る。既存 session DB からは借りない。 */
  const draftModelModeListSource = useMemo(() => {
    const c = probedModelCatalog;
    const availableModels = orderModelOptions({
      options: c?.availableModels ?? [],
      favoriteModelIds: activePresetFavoriteModelIds,
      lastUsedModelId: activePresetLastUsedModelId,
    });
    return {
      availableModels,
      availableModes: modeOptionsWithSavedPreferences({
        currentModeId: c?.currentModeId ?? null,
        lastUsedModeId: activePresetLastUsedModeId,
        options: c?.availableModes ?? [],
      }),
      currentModelId: c?.currentModelId ?? null,
      currentModeId: c?.currentModeId ?? null,
    };
  }, [
    activePresetFavoriteModelIds,
    activePresetLastUsedModeId,
    activePresetLastUsedModelId,
    probedModelCatalog,
  ]);

  const draftModelSourceHasList = draftModelModeListSource.availableModels.length > 0;
  const draftModeSourceHasList = draftModelModeListSource.availableModes.length > 0;
  const isPreparingDraftProvider =
    shouldUsePreparedDraftSession && preparingScopesByKey[preparedSessionScopeKey] === true;
  const draftPrepareError = shouldUsePreparedDraftSession
    ? (prepareErrorsByScope[preparedSessionScopeKey] ?? null)
    : null;
  const draftCatalogError = probedModelCatalog?.lastError ?? null;
  const draftModelSelectValue = draftModelSourceHasList
    ? (draftModelId ??
      (activePresetLastUsedModelId !== null &&
      draftModelModeListSource.availableModels.some(
        (model) => model.id === activePresetLastUsedModelId,
      )
        ? activePresetLastUsedModelId
        : null) ??
      draftModelModeListSource.currentModelId ??
      draftModelModeListSource.availableModels[0]?.id)
    : undefined;
  const draftModeSelectValue = draftModeSourceHasList
    ? (draftModeId ??
      (activePresetLastUsedModeId !== null &&
      draftModelModeListSource.availableModes.some((mode) => mode.id === activePresetLastUsedModeId)
        ? activePresetLastUsedModeId
        : null) ??
      draftModelModeListSource.currentModeId ??
      draftModelModeListSource.availableModes[0]?.id)
    : undefined;
  const sessionModelSelectValue =
    selectedSession === null
      ? undefined
      : selectedSession.isActive
        ? (selectedSession.currentModelId ?? undefined)
        : (pendingTuningModelId ?? selectedSession.currentModelId ?? undefined);
  const sessionModeSelectValue =
    selectedSession === null
      ? undefined
      : selectedSession.isActive
        ? (selectedSession.currentModeId ?? undefined)
        : (pendingTuningModeId ?? selectedSession.currentModeId ?? undefined);
  const selectedSessionCatalogMatches =
    selectedSession !== null &&
    selectedSessionModelCatalog !== null &&
    selectedSession.presetId !== null &&
    selectedSession.presetId !== undefined;
  const selectedSessionModelOptions = useMemo(
    () =>
      selectedSession?.availableModels.length === 0 && selectedSessionCatalogMatches
        ? selectedSessionModelCatalog.availableModels
        : (selectedSession?.availableModels ?? []),
    [selectedSession, selectedSessionCatalogMatches, selectedSessionModelCatalog],
  );
  const selectedSessionModeOptions = useMemo(
    () =>
      selectedSession?.availableModes.length === 0 && selectedSessionCatalogMatches
        ? selectedSessionModelCatalog.availableModes
        : (selectedSession?.availableModes ?? []),
    [selectedSession, selectedSessionCatalogMatches, selectedSessionModelCatalog],
  );
  const selectedSessionAvailableModels = useMemo(
    () =>
      orderModelOptions({
        options: selectedSessionModelOptions,
        favoriteModelIds: selectedSessionFavoriteModelIds,
        lastUsedModelId: selectedSession?.currentModelId ?? null,
      }),
    [selectedSession?.currentModelId, selectedSessionFavoriteModelIds, selectedSessionModelOptions],
  );
  const draftModelSelectInfo = formatAcpSelectValueInfo({
    kind: 'model',
    options: draftModelModeListSource.availableModels,
    presetId: activePresetId,
    value: draftModelSelectValue,
  });
  const draftModeSelectInfo = formatAcpSelectValueInfo({
    kind: 'mode',
    options: draftModelModeListSource.availableModes,
    presetId: activePresetId,
    value: draftModeSelectValue,
  });
  const sessionModelSelectInfo = formatAcpSelectValueInfo({
    kind: 'model',
    options: selectedSessionAvailableModels,
    presetId: selectedSession?.presetId,
    value: sessionModelSelectValue,
  });
  const sessionModeSelectInfo = formatAcpSelectValueInfo({
    kind: 'mode',
    options: selectedSessionModeOptions,
    presetId: selectedSession?.presetId,
    value: sessionModeSelectValue,
  });
  const activeTranscriptKey =
    sessionId ?? draftSessionTranscriptKeyForGeneration(draftViewGeneration);
  const activeTranscriptCwd = selectedSession?.cwd ?? project.workingDirectory;

  useLayoutEffect(() => {
    activeTranscriptKeyRef.current = activeTranscriptKey;
  }, [activeTranscriptKey]);

  const transcript = useMemo(
    () => transcripts[activeTranscriptKey] ?? [],
    [activeTranscriptKey, transcripts],
  );
  const liveSlashCommands = useMemo(() => latestAvailableSlashCommands(transcript), [transcript]);
  const effectiveSlashCommands = liveSlashCommands.length > 0 ? liveSlashCommands : slashCommands;
  const latestUsage = useMemo(() => latestAcpUsageUpdate(transcript), [transcript]);
  const activePermissionRequests = permissionRequestsData.requests.filter(
    (request) => request.sessionId === activeTranscriptKey,
  );
  const isTranscriptHydrating = shouldShowConversationLoading({
    isDraftSession: shouldUseDraftSession,
    transcriptKey: activeTranscriptKey,
    transcripts,
  });
  const mergedForDisplay = mergeToolCallResultMessages(transcript);
  const visibleTranscript = mergedForDisplay.filter((message) => {
    const d = filterDisplayableRawEvents(message.rawEvents);
    return shouldDisplayTranscriptMessage(message, d);
  });
  const chatScrollSignature = visibleTranscript
    .map((message) =>
      [
        message.id,
        message.updatedAt ?? '',
        message.text.length,
        message.rawEvents.length,
        message.rawEvents.map((event) => event.rawText.length).join('.'),
      ].join(':'),
    )
    .join('|');
  const permissionRequestSignature = activePermissionRequests
    .map((request) => `${request.id}:${request.createdAt}:${request.options.length.toString()}`)
    .join('|');
  const projectUrl = `/projects/${projectId}`;

  const navigateToSession = useCallback(
    (nextSessionId: string | null, options: { readonly replace?: boolean } = {}) => {
      void navigate({
        search: { 'session-id': nextSessionId ?? undefined },
        replace: options.replace === true,
      });
    },
    [navigate],
  );

  const navigateToStartedDraftSession = useCallback(
    (nextSessionId: string) => {
      const request = draftSessionRedirectRequestRef.current;
      if (request === null) {
        return;
      }
      if (
        !shouldRedirectDraftSessionStart({
          currentDraftViewGeneration: draftViewGenerationRef.current,
          nextSessionId,
          request,
        })
      ) {
        return;
      }

      draftSessionRedirectRequestRef.current = {
        draftTranscriptKey: request.draftTranscriptKey,
        draftViewGeneration: request.draftViewGeneration,
        redirectedSessionId: nextSessionId,
      };
      navigateToSession(nextSessionId);
    },
    [navigateToSession],
  );

  const clearDraftSessionRedirectRequest = useCallback((draftViewGeneration: number | null) => {
    const request = draftSessionRedirectRequestRef.current;
    if (
      draftViewGeneration !== null &&
      request !== null &&
      request.draftViewGeneration === draftViewGeneration
    ) {
      draftSessionRedirectRequestRef.current = null;
    }
  }, []);

  useEffect(() => {
    setDraftModelId(null);
    setDraftModeId(null);
  }, [activePresetId]);

  useEffect(() => {
    setPendingTuningModelId(null);
    setPendingTuningModeId(null);
    setSelectedSessionModelCatalog(null);
  }, [selectedSession?.sessionId]);

  const createSessionMutation = useMutation({
    mutationFn: createSessionRequest,
  });

  const createProjectWorktreeMutation = useMutation({
    mutationFn: ({
      name,
      targetProjectId,
    }: {
      readonly targetProjectId: string;
      readonly name: string;
    }) =>
      createProjectWorktreeRequest(targetProjectId, {
        name,
        branchName: `ra/${name}`,
        baseRef: 'HEAD',
      }),
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({
      sessionId: targetSessionId,
      modelId,
      modeId,
    }: {
      readonly sessionId: string;
      readonly modelId?: string | null;
      readonly modeId?: string | null;
    }) => updateSessionRequest(targetSessionId, { modelId, modeId }),
  });

  const updateSessionConfigOptionMutation = useMutation({
    mutationFn: ({
      configId,
      sessionId: targetSessionId,
      value,
    }: {
      readonly sessionId: string;
      readonly configId: string;
      readonly value: string;
    }) => updateSessionConfigOptionRequest(targetSessionId, { configId, value }),
  });

  const updateProjectModelPreferenceMutation = useMutation({
    mutationFn: ({
      isFavorite,
      modelId,
      presetId,
    }: {
      readonly presetId: string;
      readonly modelId: string;
      readonly isFavorite: boolean;
    }) =>
      updateProjectModelPreferenceRequest(projectId, {
        presetId,
        modelId,
        isFavorite,
      }),
  });

  const updateProjectModePreferenceMutation = useMutation({
    mutationFn: ({ modeId, presetId }: { readonly presetId: string; readonly modeId: string }) =>
      updateProjectModePreferenceRequest(projectId, {
        presetId,
        modeId,
        markLastUsed: true,
      }),
  });

  const closeSessionMutation = useMutation({
    mutationFn: deleteSessionRequest,
  });

  const cancelSessionMutation = useMutation({
    mutationFn: cancelSessionRequest,
  });

  const stopSessionMutation = useMutation({
    mutationFn: stopSessionRequest,
  });

  const resolvePermissionMutation = useMutation({
    mutationFn: ({
      optionId,
      requestId,
    }: {
      readonly requestId: string;
      readonly optionId: string | null;
    }) => resolveAcpPermissionRequest(requestId, { optionId }),
  });

  const sendPromptMutation = useMutation({
    mutationFn: ({
      attachmentIds,
      modelId: tuningModelId,
      modeId: tuningModeId,
      sessionId: targetSessionId,
      nextPrompt,
    }: {
      readonly attachmentIds: readonly string[];
      readonly sessionId: string;
      readonly nextPrompt: string;
      readonly modelId?: string | null;
      readonly modeId?: string | null;
    }) =>
      sendPromptRequest(targetSessionId, {
        attachmentIds,
        modelId: tuningModelId,
        modeId: tuningModeId,
        prompt: nextPrompt,
      }),
  });

  const sendPreparedPromptMutation = useMutation({
    mutationFn: ({
      attachmentIds,
      modeId: tuningModeId,
      modelId: tuningModelId,
      nextPrompt,
      prepareId,
    }: {
      readonly attachmentIds: readonly string[];
      readonly prepareId: string;
      readonly nextPrompt: string;
      readonly modelId?: string | null;
      readonly modeId?: string | null;
    }) =>
      sendPreparedPromptRequest(prepareId, {
        attachmentIds,
        modelId: tuningModelId,
        modeId: tuningModeId,
        prompt: nextPrompt,
      }),
  });

  const uploadAttachmentsMutation = useMutation({
    mutationFn: uploadAttachmentsRequest,
  });

  const isAssistantRequestPending =
    createProjectWorktreeMutation.isPending ||
    createSessionMutation.isPending ||
    sendPromptMutation.isPending ||
    sendPreparedPromptMutation.isPending;
  const isAwaitingActiveAssistantResponse =
    awaitingAssistantTranscriptKeys.includes(activeTranscriptKey);
  const isSending =
    isAwaitingActiveAssistantResponse ||
    updateSessionConfigOptionMutation.isPending ||
    updateSessionMutation.isPending ||
    cancelSessionMutation.isPending ||
    stopSessionMutation.isPending ||
    uploadAttachmentsMutation.isPending;
  const isEditorDisabled = isAwaitingActiveAssistantResponse;
  const isSelectedSessionRunning =
    !shouldUseDraftSession && selectedSession !== null && selectedSession.status === 'running';
  const shouldShowThinking = isAwaitingActiveAssistantResponse || isSelectedSessionRunning;
  const shouldShowScrollBanner =
    !isChatFollowingTail && (visibleTranscript.length > 0 || shouldShowThinking);
  const scrollBannerMessageCount =
    unreadMessageCount > 0 ? unreadMessageCount : Math.max(1, messagesBelowScroll);
  const scrollBannerLabel = `${scrollBannerMessageCount.toString()}件のメッセージ`;
  useEffect(() => {
    if (!shouldUseDraftSession || !isAssistantRequestPending) {
      return;
    }

    const onAcpSseEvent = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      const detail: unknown = event.detail;
      const parsed = (() => {
        try {
          return parseAcpSseEventJson(JSON.stringify(detail));
        } catch {
          return null;
        }
      })();
      if (parsed === null) {
        return;
      }
      const sseEvent: AcpSseEvent = parsed;
      if (
        sseEvent.type === 'agent_catalog_updated' ||
        sseEvent.type === 'session_removed' ||
        sseEvent.type === 'permission_requests_updated'
      ) {
        return;
      }
      const nextSessionId = sseEvent.sessionId;
      setAwaitingAssistantTranscriptKeys((current) =>
        current.includes(nextSessionId) ? current : [...current, nextSessionId],
      );
      setTranscripts((current) =>
        current[nextSessionId] === undefined && draftSessionRedirectRequestRef.current !== null
          ? moveTranscript({
              from: draftSessionRedirectRequestRef.current.draftTranscriptKey,
              to: nextSessionId,
              transcripts: current,
            })
          : current,
      );
      navigateToStartedDraftSession(nextSessionId);
    };

    window.addEventListener(ACP_SSE_BROWSER_EVENT, onAcpSseEvent);
    return () => {
      window.removeEventListener(ACP_SSE_BROWSER_EVENT, onAcpSseEvent);
    };
  }, [isAssistantRequestPending, navigateToStartedDraftSession, shouldUseDraftSession]);
  const handleMessagesHydrated = useCallback(
    (targetSessionId: string, messages: readonly ChatMessage[]) => {
      setTranscripts((current) => {
        const local = current[targetSessionId] ?? [];
        if (local.length === 0) {
          return {
            ...current,
            [targetSessionId]: messages.map((message) => ({ ...message })),
          };
        }
        if (
          messages.length === 0 &&
          isAssistantRequestPending &&
          awaitingAssistantTranscriptKeys.includes(targetSessionId)
        ) {
          return current;
        }
        /**
         * 送信中に SSE 由来の再取得で、新メッセージ行が未コミットの古いスナップショット
         * （本より短い行数）が届くと、ここで上書きすると履歴を全部失ったように見える。
         * 行は append-only の前提なので、短い取得ではローカルより退けない。
         */
        if (local.length > 0 && messages.length < local.length) {
          return current;
        }
        return {
          ...current,
          [targetSessionId]: messages.map((message) => ({ ...message })),
        };
      });
    },
    [awaitingAssistantTranscriptKeys, isAssistantRequestPending],
  );
  const attachmentNames = attachedFiles.map((attachment) => attachment.name);
  const canSendPrompt = useCallback(
    (value: string) =>
      canSendWithDraftWorktreeState({
        activePresetId,
        isSending,
        promptText: buildPromptText(value, attachmentNames),
        shouldUseDraftSession,
        useDraftWorktree,
        worktreeName: draftWorktreeName,
      }),
    [
      activePresetId,
      attachmentNames,
      draftWorktreeName,
      isSending,
      shouldUseDraftSession,
      useDraftWorktree,
    ],
  );
  const canSend = canSendWithDraftWorktreeState({
    activePresetId,
    isSending,
    promptText: 'ready',
    shouldUseDraftSession,
    useDraftWorktree,
    worktreeName: draftWorktreeName,
  });

  const addAwaitingAssistantTranscriptKeys = (keys: readonly string[]) => {
    setAwaitingAssistantTranscriptKeys((current) => [
      ...current,
      ...keys.filter((key) => !current.includes(key)),
    ]);
  };

  const removeAwaitingAssistantTranscriptKeys = (keys: readonly string[]) => {
    setAwaitingAssistantTranscriptKeys((current) => current.filter((key) => !keys.includes(key)));
  };

  const thinkingModelLabel = useMemo((): string => {
    if (shouldUseDraftSession) {
      if (!draftModelSourceHasList) {
        return 'Model';
      }
      const id =
        draftModelId ??
        draftModelModeListSource.currentModelId ??
        draftModelModeListSource.availableModels[0]?.id;
      const found =
        id !== undefined
          ? draftModelModeListSource.availableModels.find((m) => m.id === id)
          : undefined;
      return found?.name ?? id ?? 'Model';
    }
    if (selectedSession !== null) {
      const id = selectedSession.currentModelId;
      const found =
        id !== undefined ? selectedSession.availableModels.find((m) => m.id === id) : undefined;
      return found?.name ?? id ?? 'Model';
    }
    return 'Model';
  }, [
    draftModelId,
    draftModelModeListSource,
    draftModelSourceHasList,
    selectedSession,
    shouldUseDraftSession,
  ]);

  const setSessionsData = (updater: (sessions: readonly SessionSummary[]) => SessionSummary[]) => {
    queryClient.setQueryData<SessionsResponse>(sessionsQueryKey, (current) =>
      current === undefined
        ? current
        : {
            sessions: updater(current.sessions),
          },
    );
  };

  const upsertSessionInCache = (session: SessionSummary) => {
    setSessionsData((sessions) =>
      sessions.some((entry) => entry.sessionId === session.sessionId)
        ? sessions.map((entry) => (entry.sessionId === session.sessionId ? session : entry))
        : [session, ...sessions],
    );
  };

  const appendSessionMessageInCache = (targetSessionId: string, message: ChatMessage) => {
    queryClient.setQueryData<SessionMessagesResponse>(
      sessionMessagesQueryKey(targetSessionId),
      (current) => {
        if (current === undefined) {
          return { messages: [message] };
        }
        if (current.messages.some((entry) => entry.id === message.id)) {
          return current;
        }
        return { messages: [...current.messages, message] };
      },
    );
  };

  const handleAttachFiles = async (files: readonly File[]) => {
    const response = await uploadAttachmentsMutation.mutateAsync(files);
    setAttachedFiles((current) => [...current, ...response.attachments]);
  };

  const handleOpenAttachFilePicker = () => {
    attachFileInputRef.current?.click();
  };

  const handleToggleSpeechInput = () => {
    if (isEditorDisabled) {
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
      replacePrompt(
        appendRichPromptText({ value: promptReaderRef.current(), addition: speechText }),
      );
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

  const handleAttachFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = input.files === null ? [] : [...input.files];
    if (files.length === 0) {
      return;
    }

    void handleAttachFiles(files).finally(() => {
      input.value = '';
    });
  };

  const handleRemoveFile = (attachmentId: string) => {
    setAttachedFiles((current) =>
      current.filter((attachment) => attachment.attachmentId !== attachmentId),
    );
  };

  const handleToggleFavoriteModel = async ({
    currentFavorite,
    modelId,
    presetId,
  }: {
    readonly presetId: string;
    readonly modelId: string | null | undefined;
    readonly currentFavorite: boolean;
  }) => {
    if (modelId === null || modelId === undefined || modelId.length === 0) {
      return;
    }
    if (presetId.length === 0) {
      return;
    }

    const response = await updateProjectModelPreferenceMutation.mutateAsync({
      presetId,
      modelId,
      isFavorite: !currentFavorite,
    });
    queryClient.setQueryData(projectSettingsQueryKey(projectId), response);
    void queryClient.invalidateQueries({ queryKey: projectSettingsQueryKey(projectId) });
  };

  const handleMarkModeLastUsed = async ({
    modeId,
    presetId,
  }: {
    readonly presetId: string | null | undefined;
    readonly modeId: string | null | undefined;
  }) => {
    if (
      presetId === null ||
      presetId === undefined ||
      presetId.length === 0 ||
      modeId === null ||
      modeId === undefined ||
      modeId.length === 0
    ) {
      return;
    }

    const response = await updateProjectModePreferenceMutation.mutateAsync({
      presetId,
      modeId,
    });
    queryClient.setQueryData(projectSettingsQueryKey(projectId), response);
  };

  const handleUpdateSession = async ({
    modelId,
    modeId,
  }: {
    readonly modelId?: string | null;
    readonly modeId?: string | null;
  }) => {
    if (selectedSession === null) {
      return;
    }

    if (!selectedSession.isActive) {
      if (modelId !== undefined) {
        setPendingTuningModelId(modelId);
      }
      if (modeId !== undefined) {
        setPendingTuningModeId(modeId);
        void handleMarkModeLastUsed({
          presetId: selectedSession.presetId,
          modeId,
        });
      }
      return;
    }

    const previousSessions = queryClient.getQueryData<SessionsResponse>(sessionsQueryKey);

    upsertSessionInCache({
      ...selectedSession,
      currentModelId: modelId ?? selectedSession.currentModelId,
      currentModeId: modeId ?? selectedSession.currentModeId,
    });

    try {
      const response = await updateSessionMutation.mutateAsync({
        sessionId: selectedSession.sessionId,
        modelId,
        modeId,
      });
      upsertSessionInCache(response.session);
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
      if (modelId !== undefined || modeId !== undefined) {
        void queryClient.invalidateQueries({ queryKey: projectSettingsQueryKey(projectId) });
      }
      if (modeId !== undefined) {
        void handleMarkModeLastUsed({
          presetId: response.session.presetId,
          modeId: response.session.currentModeId ?? modeId,
        });
      }
    } catch {
      queryClient.setQueryData(sessionsQueryKey, previousSessions);
    }
  };

  const handleUpdateSessionConfigOption = async ({
    configId,
    value,
  }: {
    readonly configId: string;
    readonly value: string;
  }) => {
    if (selectedSession === null || !selectedSession.isActive) {
      return;
    }

    const previousSessions = queryClient.getQueryData<SessionsResponse>(sessionsQueryKey);
    const nextConfigOptions = selectedSession.configOptions.map((option) =>
      option.id === configId ? { ...option, currentValue: value } : option,
    );

    upsertSessionInCache({
      ...selectedSession,
      configOptions: nextConfigOptions,
    });

    try {
      const response = await updateSessionConfigOptionMutation.mutateAsync({
        sessionId: selectedSession.sessionId,
        configId,
        value,
      });
      upsertSessionInCache(response.session);
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    } catch {
      queryClient.setQueryData(sessionsQueryKey, previousSessions);
    }
  };

  const handleCloseSession = async (targetSessionId: string) => {
    const previousSessions = queryClient.getQueryData<SessionsResponse>(sessionsQueryKey);

    setSessionsData((sessions) =>
      sessions.filter((session) => session.sessionId !== targetSessionId),
    );
    if (sessionId === targetSessionId) {
      navigateToSession(null);
    }

    try {
      await closeSessionMutation.mutateAsync(targetSessionId);
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    } catch {
      queryClient.setQueryData(sessionsQueryKey, previousSessions);
    }
  };

  const handleCancelSession = async (targetSessionId: string) => {
    const previousSessions = queryClient.getQueryData<SessionsResponse>(sessionsQueryKey);
    setSessionsData((sessions) =>
      sessions.map((session) =>
        session.sessionId === targetSessionId
          ? { ...session, status: 'paused', isActive: true }
          : session,
      ),
    );
    removeAwaitingAssistantTranscriptKeys([targetSessionId, activeTranscriptKey]);

    try {
      const response = await cancelSessionMutation.mutateAsync(targetSessionId);
      upsertSessionInCache(response.session);
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
      void queryClient.invalidateQueries({ queryKey: acpPermissionRequestsQueryKey });
      void queryClient.invalidateQueries({ queryKey: sessionMessagesQueryKey(targetSessionId) });
    } catch {
      queryClient.setQueryData(sessionsQueryKey, previousSessions);
    }
  };

  const handleStopSession = async (targetSessionId: string) => {
    const previousSessions = queryClient.getQueryData<SessionsResponse>(sessionsQueryKey);
    setSessionsData((sessions) =>
      sessions.map((session) =>
        session.sessionId === targetSessionId
          ? { ...session, status: 'inactive', isActive: false }
          : session,
      ),
    );

    try {
      const response = await stopSessionMutation.mutateAsync(targetSessionId);
      upsertSessionInCache(response.session);
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
      void queryClient.invalidateQueries({ queryKey: acpPermissionRequestsQueryKey });
    } catch {
      queryClient.setQueryData(sessionsQueryKey, previousSessions);
    }
  };

  const handleResolvePermission = async (requestId: string, optionId: string | null) => {
    const response = await resolvePermissionMutation.mutateAsync({ requestId, optionId });
    queryClient.setQueryData(acpPermissionRequestsQueryKey, response);
    void queryClient.invalidateQueries({ queryKey: acpPermissionRequestsQueryKey });
  };

  const handleSendPrompt = async (promptValue = promptReaderRef.current()) => {
    const nextPrompt = buildPromptText(promptValue, attachmentNames);
    if (nextPrompt.length === 0) {
      return;
    }
    if (draftWorktreeValidationError !== null) {
      toast.error(draftWorktreeValidationError);
      return;
    }

    const previousPrompt = promptValue;
    const requestAttachmentIds = attachedFiles.map((attachment) => attachment.attachmentId);
    const userMessage = createChatMessage('user', nextPrompt, [], {
      kind: 'user',
      attachments: userAttachmentsFromUploaded(attachedFiles),
    });
    const initialTranscriptKey = activeTranscriptKey;
    let requestAwaitingTranscriptKeys: readonly string[] = [initialTranscriptKey];

    shouldStickToBottomRef.current = true;
    setIsChatFollowingTail(true);
    addAwaitingAssistantTranscriptKeys(requestAwaitingTranscriptKeys);
    speechRecognitionRef.current?.stop();
    setIsListeningToSpeech(false);
    replacePrompt('');
    setAttachedFiles([]);
    setTranscripts((current) =>
      appendTranscriptMessage({
        message: userMessage,
        transcriptKey: initialTranscriptKey,
        transcripts: current,
      }),
    );

    const sessionForTuning = selectedSession;
    let activeSessionId = sessionId;
    const draftRedirectGeneration =
      activeSessionId === null ? draftViewGenerationRef.current : null;
    if (draftRedirectGeneration !== null) {
      draftSessionRedirectRequestRef.current = {
        draftTranscriptKey: initialTranscriptKey,
        draftViewGeneration: draftRedirectGeneration,
        redirectedSessionId: null,
      };
    }

    try {
      if (activeSessionId === null) {
        const worktreeResponse = useDraftWorktree
          ? await createProjectWorktreeMutation.mutateAsync({
              targetProjectId: project.id,
              name: trimmedDraftWorktreeName,
            })
          : null;
        const sessionCwd = worktreeResponse?.worktree.path ?? project.workingDirectory;
        const preparedSessionId = useDraftWorktree
          ? undefined
          : preparedSessionIdsByScope[preparedSessionScopeKey];
        const modelIdForCreate = draftModelSourceHasList
          ? (draftModelId ??
            (activePresetLastUsedModelId !== null &&
            draftModelModeListSource.availableModels.some(
              (model) => model.id === activePresetLastUsedModelId,
            )
              ? activePresetLastUsedModelId
              : null) ??
            draftModelModeListSource.currentModelId ??
            draftModelModeListSource.availableModels[0]?.id ??
            undefined)
          : undefined;
        const modeIdForCreate = draftModeSourceHasList
          ? (draftModeId ??
            (activePresetLastUsedModeId !== null &&
            draftModelModeListSource.availableModes.some(
              (mode) => mode.id === activePresetLastUsedModeId,
            )
              ? activePresetLastUsedModeId
              : null) ??
            draftModelModeListSource.currentModeId ??
            draftModelModeListSource.availableModes[0]?.id ??
            undefined)
          : undefined;
        if (preparedSessionId !== undefined) {
          const response = await sendPreparedPromptMutation.mutateAsync({
            attachmentIds: requestAttachmentIds,
            prepareId: preparedSessionId,
            nextPrompt,
            modelId: modelIdForCreate,
            modeId: modeIdForCreate,
          });

          activeSessionId = response.session.sessionId;
          requestAwaitingTranscriptKeys = [initialTranscriptKey, response.session.sessionId];
          addAwaitingAssistantTranscriptKeys(requestAwaitingTranscriptKeys);
          upsertSessionInCache(response.session);
          setTranscripts((current) =>
            moveTranscript({
              from: initialTranscriptKey,
              to: response.session.sessionId,
              transcripts: current,
            }),
          );
          navigateToStartedDraftSession(response.session.sessionId);
          if (document.visibilityState === 'hidden') {
            void showAssistantResponseNotification({
              projectId: project.id,
              projectName: project.name,
              sessionId: response.session.sessionId,
              text: response.text,
              timestamp: Date.now(),
              url: projectUrl,
            });
          }
          void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
          void queryClient.invalidateQueries({ queryKey: projectSettingsQueryKey(projectId) });
          void queryClient.invalidateQueries({
            queryKey: sessionMessagesQueryKey(response.session.sessionId),
          });
          setPendingTuningModelId(null);
          setPendingTuningModeId(null);
          removeAwaitingAssistantTranscriptKeys(requestAwaitingTranscriptKeys);
          clearDraftSessionRedirectRequest(draftRedirectGeneration);
          return;
        }
        const sessionResponse = await createSessionMutation.mutateAsync({
          projectId: project.id,
          presetId: draftSession.presetId,
          command: null,
          argsText: '',
          cwd: sessionCwd,
          modelId: modelIdForCreate,
          modeId: modeIdForCreate,
        });

        activeSessionId = sessionResponse.session.sessionId;
        requestAwaitingTranscriptKeys = [initialTranscriptKey, sessionResponse.session.sessionId];
        addAwaitingAssistantTranscriptKeys(requestAwaitingTranscriptKeys);
        upsertSessionInCache(sessionResponse.session);
        setTranscripts((current) =>
          moveTranscript({
            from: initialTranscriptKey,
            to: sessionResponse.session.sessionId,
            transcripts: current,
          }),
        );
        navigateToStartedDraftSession(sessionResponse.session.sessionId);
      }

      if (activeSessionId === null) {
        throw new Error('failed to resolve active session');
      }

      const resolvedActiveSessionId = activeSessionId;
      appendSessionMessageInCache(resolvedActiveSessionId, userMessage);
      const inactiveTuning: { modelId?: string; modeId?: string } = {};
      if (sessionForTuning !== null && !sessionForTuning.isActive) {
        const modelEffective = pendingTuningModelId ?? sessionForTuning.currentModelId ?? null;
        const modeEffective = pendingTuningModeId ?? sessionForTuning.currentModeId ?? null;
        if (modelEffective !== null && modelEffective.length > 0) {
          inactiveTuning.modelId = modelEffective;
        }
        if (modeEffective !== null && modeEffective.length > 0) {
          inactiveTuning.modeId = modeEffective;
        }
      }
      const response = await sendPromptMutation.mutateAsync({
        attachmentIds: requestAttachmentIds,
        sessionId: resolvedActiveSessionId,
        nextPrompt,
        ...inactiveTuning,
      });

      upsertSessionInCache(response.session);
      if (document.visibilityState === 'hidden') {
        void showAssistantResponseNotification({
          projectId: project.id,
          projectName: project.name,
          sessionId: resolvedActiveSessionId,
          text: response.text,
          timestamp: Date.now(),
          url: projectUrl,
        });
      }

      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
      void queryClient.invalidateQueries({ queryKey: projectSettingsQueryKey(projectId) });
      void queryClient.invalidateQueries({
        queryKey: sessionMessagesQueryKey(resolvedActiveSessionId),
      });
      setPendingTuningModelId(null);
      setPendingTuningModeId(null);
      removeAwaitingAssistantTranscriptKeys(requestAwaitingTranscriptKeys);
      clearDraftSessionRedirectRequest(draftRedirectGeneration);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to send prompt';
      removeAwaitingAssistantTranscriptKeys(requestAwaitingTranscriptKeys);
      clearDraftSessionRedirectRequest(draftRedirectGeneration);
      if (activeTranscriptKeyRef.current === initialTranscriptKey) {
        replacePrompt(previousPrompt);
        setAttachedFiles((current) =>
          current.length === 0 ? attachedFiles.map((attachment) => ({ ...attachment })) : current,
        );
      }
      setTranscripts((current) =>
        appendTranscriptMessage({
          message: createChatMessage('assistant', `Error: ${message}`, [], {
            kind: 'legacy_assistant_turn',
          }),
          transcriptKey: activeSessionId ?? initialTranscriptKey,
          transcripts: current,
        }),
      );

      if (document.visibilityState === 'hidden') {
        void showAssistantResponseNotification({
          projectId: project.id,
          projectName: project.name,
          sessionId: activeSessionId ?? draftSessionTranscriptKey,
          text: `Error: ${message}`,
          timestamp: Date.now(),
          url: projectUrl,
        });
      }
    }
  };

  const firstUserTextInTranscript = (targetSessionId: string) =>
    transcripts[targetSessionId]?.find((message) => message.role === 'user')?.text ?? null;
  const pageTitle = shouldUseDraftSession
    ? 'New session'
    : selectedSession !== null
      ? resolveSessionListTitle(
          selectedSession,
          firstUserTextInTranscript(selectedSession.sessionId),
        )
      : sessionId !== null
        ? (firstUserTextInTranscript(sessionId) ?? sessionId)
        : 'Session';
  const pageAgentLabel = shouldUseDraftSession
    ? draftSession.label
    : (selectedSessionPreset?.label ??
      selectedSession?.presetId ??
      selectedSession?.command ??
      'custom');

  const handleChatScroll: UIEventHandler<HTMLDivElement> = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.dataset['slot'] !== 'scroll-area-viewport') {
      return;
    }

    const nextIsFollowing = isNearScrollBottom({
      clientHeight: target.clientHeight,
      scrollHeight: target.scrollHeight,
      scrollTop: target.scrollTop,
    });
    shouldStickToBottomRef.current = nextIsFollowing;
    setIsChatFollowingTail(nextIsFollowing);
    if (nextIsFollowing) {
      setUnreadMessageCount(0);
    }

    // Calculate messages below scroll position
    const scrollableHeight = target.scrollHeight - target.clientHeight;
    if (scrollableHeight <= 0) {
      setMessagesBelowScroll(0);
    } else {
      const scrollPercentage = target.scrollTop / scrollableHeight;
      setMessagesBelowScroll(
        Math.max(0, Math.round(visibleTranscript.length * (1 - scrollPercentage))),
      );
    }
  };

  const handleJumpToLatest = () => {
    shouldStickToBottomRef.current = true;
    setIsChatFollowingTail(true);
    setUnreadMessageCount(0);
    scrollAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  };

  useEffect(() => {
    setUnreadMessageCount((currentUnreadCount) =>
      nextUnreadMessageCount({
        currentUnreadCount,
        isFollowingTail: shouldStickToBottomRef.current,
        nextMessageCount: visibleTranscript.length,
        previousMessageCount: previousVisibleMessageCountRef.current,
      }),
    );
    previousVisibleMessageCountRef.current = visibleTranscript.length;
  }, [chatScrollSignature, permissionRequestSignature, visibleTranscript.length]);

  useLayoutEffect(() => {
    const didSessionChange = lastActiveTranscriptKeyRef.current !== activeTranscriptKey;
    if (didSessionChange) {
      lastActiveTranscriptKeyRef.current = activeTranscriptKey;
      shouldStickToBottomRef.current = true;
      setIsChatFollowingTail(true);
      setUnreadMessageCount(0);
      setMessagesBelowScroll(0);
      previousVisibleMessageCountRef.current = visibleTranscript.length;
    }
    if (!shouldStickToBottomRef.current) {
      return;
    }
    scrollAnchorRef.current?.scrollIntoView({ block: 'end' });
  }, [
    activeTranscriptKey,
    chatScrollSignature,
    permissionRequestSignature,
    shouldShowThinking,
    transcript.length,
    visibleTranscript.length,
  ]);

  return (
    <div className="app-page h-full">
      {shouldUseDraftSession && (
        <Suspense fallback={null}>
          {activePresetId.length > 0 ? (
            <DraftAgentModelCatalogLoader
              key={draftCatalogScopeKey}
              presetId={activePresetId}
              projectId={projectId}
              onReady={onAgentCatalogReady}
            />
          ) : null}
        </Suspense>
      )}
      {sessionId === null ? null : (
        <Suspense fallback={null}>
          <SessionMessagesHydrator
            key={sessionId}
            onHydrated={handleMessagesHydrated}
            sessionId={sessionId}
          />
        </Suspense>
      )}
      {slashCommandPresetId.length > 0 ? (
        <Suspense fallback={null}>
          <SlashCommandsLoader
            key={slashCommandScopeKey}
            onReady={onSlashCommandsReady}
            presetId={slashCommandPresetId}
            projectId={projectId}
            scopeKey={slashCommandScopeKey}
          />
        </Suspense>
      ) : null}
      {selectedSession !== null &&
      selectedSession.presetId !== null &&
      selectedSession.presetId !== undefined &&
      (selectedSession.availableModels.length === 0 ||
        selectedSession.availableModes.length === 0) ? (
        <Suspense fallback={null}>
          <DraftAgentModelCatalogLoader
            key={`${selectedSession.sessionId}\0${selectedSession.presetId}`}
            onReady={onSelectedSessionCatalogReady}
            presetId={selectedSession.presetId}
            projectId={projectId}
          />
        </Suspense>
      ) : null}
      <ProjectMenuContent
        canLoadSessions={canLoadSessions}
        currentSessionId={sessionId}
        onOpenLoadSessions={openLoadSessionDialog}
        projectId={projectId}
        sessionCount={projectSessions.length}
        sessions={projectSessions}
      />
      {loadSessionDialog}
      <div className="flex h-full flex-col px-2 py-2 md:px-3">
        <header className="flex h-10 shrink-0 items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight">{pageTitle}</h1>
            <span className="shrink-0 text-xs text-muted-foreground">{pageAgentLabel}</span>
          </div>
          {sessionId !== null ? (
            <div className="flex shrink-0 items-center gap-1">
              {selectedSession !== null &&
              selectedSession.isActive &&
              selectedSession.status === 'paused' ? (
                <Button
                  aria-label="Stop paused session"
                  disabled={stopSessionMutation.isPending}
                  onClick={() => {
                    void handleStopSession(sessionId);
                  }}
                  size="icon-sm"
                  title="Stop"
                  type="button"
                  variant="ghost"
                >
                  {stopSessionMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PowerOff className="size-4" />
                  )}
                </Button>
              ) : null}
              <Button
                aria-label="Close session"
                disabled={closeSessionMutation.isPending}
                onClick={() => {
                  void handleCloseSession(sessionId);
                }}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ) : null}
        </header>

        <section className="min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="relative min-h-0 flex-1">
              <ScrollArea
                className="app-transcript-surface h-full"
                onScrollCapture={handleChatScroll}
              >
                <div
                  className={cn(
                    'space-y-5 px-1 pt-3 md:space-y-6 md:px-2',
                    shouldShowScrollBanner ? 'pb-10' : 'pb-2',
                  )}
                  ref={chatContentRef}
                >
                  {isTranscriptHydrating ? <LoadingConversation /> : null}
                  {!isTranscriptHydrating && transcript.length === 0 && !shouldShowThinking ? (
                    <div className="mx-auto flex max-w-md flex-col items-center">
                      <div className="w-full rounded-lg border border-dashed border-border/70 bg-card/60 px-6 py-12 text-center">
                        <MessageSquareDashed className="mx-auto mb-3 size-8 text-muted-foreground/80" />
                        <p className="text-sm font-medium text-foreground/90">
                          新しいチャットを開始
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          下の欄に入力して会話を始めましょう
                        </p>
                      </div>
                      {projectSessions.length > 0 ? (
                        <div className="mt-6 w-full">
                          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-muted-foreground">
                            <History className="size-3.5" />
                            最近のセッション
                          </h3>
                          <div className="space-y-2">
                            {projectSessions.slice(0, 3).map((session) => {
                              const timestamp = sessionTimestamp(session);
                              return (
                                <Link
                                  className="block rounded-lg border border-border/50 bg-card/50 px-3 py-2.5 text-left transition-colors hover:bg-card/80"
                                  key={session.sessionId}
                                  params={{ projectId }}
                                  search={{ 'session-id': session.sessionId }}
                                  to="/projects/$projectId"
                                >
                                  <p className="truncate text-sm font-medium">
                                    {resolveSessionListTitle(session, null, { maxChars: 72 })}
                                  </p>
                                  <div className="mt-1 flex items-center justify-between gap-2">
                                    <time className="text-xs text-muted-foreground">
                                      {formatDateTime(timestamp)}
                                    </time>
                                    <Badge
                                      className={sessionStatusBadgeClassName(session.status)}
                                      variant="outline"
                                    >
                                      {sessionStatusLabel(session.status)}
                                    </Badge>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {!isTranscriptHydrating &&
                  transcript.length > 0 &&
                  visibleTranscript.length === 0 &&
                  !shouldShowThinking ? (
                    <div className="mx-auto max-w-md rounded-lg border border-dashed border-border/60 bg-card/50 px-6 py-8 text-center text-sm text-muted-foreground">
                      表示できるメッセージがありません（内部メタのみの可能性）
                    </div>
                  ) : null}

                  {visibleTranscript.map((message, index) => {
                    const isUser = message.role === 'user';
                    const displayEvents = filterDisplayableRawEvents(message.rawEvents);
                    const isToolOnly = isToolOnlyTranscriptMessage(message, displayEvents);
                    const previousMessage = visibleTranscript[index - 1];
                    const previousDisplayEvents =
                      previousMessage === undefined
                        ? []
                        : filterDisplayableRawEvents(previousMessage.rawEvents);
                    const isAfterToolOnly =
                      previousMessage !== undefined &&
                      isToolOnlyTranscriptMessage(previousMessage, previousDisplayEvents);
                    return (
                      <div
                        className={cn(
                          'group/message flex w-full',
                          isUser ? 'justify-end' : 'justify-start',
                          isToolOnly && isAfterToolOnly ? '-mt-3 md:-mt-4' : '',
                        )}
                        key={message.id}
                      >
                        <div
                          className={cn(
                            'flex min-w-0 flex-col gap-1',
                            CONVERSATION_COLUMN_CLASS,
                            isUser ? 'items-stretch' : 'items-stretch',
                          )}
                        >
                          <div
                            className={cn(
                              'flex w-full items-center gap-1',
                              isUser ? 'justify-end' : 'justify-start',
                              isToolOnly ? 'sr-only' : '',
                            )}
                          >
                            <time
                              className="select-none text-xs tabular-nums text-muted-foreground"
                              dateTime={message.createdAt}
                            >
                              {formatDateTime(message.createdAt)}
                            </time>
                            {shouldShowMessageCopyButton(message) ? (
                              <CopyBlockButton
                                className="size-6 text-muted-foreground/80 opacity-80 hover:opacity-100"
                                text={chatMessageClipboardText(message)}
                              />
                            ) : null}
                          </div>
                          {isUser ? (
                            <div className="app-user-message w-full rounded-lg border px-3 py-3 text-foreground shadow-sm">
                              <TranscriptMessageBody cwd={activeTranscriptCwd} message={message} />
                            </div>
                          ) : (
                            <div className="w-full min-w-0 text-card-foreground">
                              <TranscriptMessageBody cwd={activeTranscriptCwd} message={message} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {activePermissionRequests.length > 0 ? (
                    <div className="space-y-1">
                      {activePermissionRequests.map((request) => (
                        <PermissionRequestPanel
                          disabled={resolvePermissionMutation.isPending}
                          key={request.id}
                          onResolve={(requestId, optionId) => {
                            void handleResolvePermission(requestId, optionId);
                          }}
                          request={request}
                        />
                      ))}
                    </div>
                  ) : null}

                  {shouldShowThinking ? (
                    <div
                      className={cn(
                        'flex w-full min-w-0 flex-col',
                        CONVERSATION_COLUMN_CLASS,
                        'pl-0.5',
                      )}
                      role="status"
                    >
                      <div className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border/60 bg-card/70 px-4 py-3 text-sm text-muted-foreground shadow-sm">
                        <Loader2
                          aria-hidden
                          className="size-4 shrink-0 animate-spin text-muted-foreground"
                        />
                        <span>
                          <span className="font-medium text-foreground">{thinkingModelLabel}</span>
                          <span> が考えています…</span>
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <div aria-hidden ref={scrollAnchorRef} />
                </div>
              </ScrollArea>
              {shouldShowScrollBanner ? (
                <Button
                  aria-label="Jump to latest message"
                  className="absolute right-3 bottom-1 left-3 h-8 justify-center gap-1.5 rounded-md border bg-background/95 px-3 text-xs shadow-md backdrop-blur md:right-6 md:left-6"
                  onClick={handleJumpToLatest}
                  title={scrollBannerLabel}
                  type="button"
                  variant="outline"
                >
                  <ArrowDown className="size-4 shrink-0" />
                  <span className="truncate">{scrollBannerLabel}</span>
                </Button>
              ) : null}
            </div>

            <div className="bg-transparent px-1 pt-0 pb-0.5 md:px-2 md:pb-1">
              <div className="overflow-visible">
                {latestUsage === null ? null : (
                  <div className="mb-1">
                    <UsageProgress
                      cost={latestUsage.cost}
                      size={latestUsage.size}
                      used={latestUsage.used}
                    />
                  </div>
                )}
                {attachedFiles.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/15 px-3 py-2">
                    {attachedFiles.map((attachment) => (
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
                          onClick={() => {
                            handleRemoveFile(attachment.attachmentId);
                          }}
                          type="button"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                {shouldUseDraftSession ? (
                  <div className="flex min-w-0 flex-wrap items-start gap-2 border-b bg-muted/10 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-border/70 bg-background px-2 py-1">
                      <button
                        aria-checked={useDraftWorktree}
                        aria-label={
                          useDraftWorktree
                            ? 'Disable worktree creation'
                            : 'Enable worktree creation'
                        }
                        className={cn(
                          'inline-flex h-6 min-w-11 items-center rounded-full border px-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                          useDraftWorktree
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-muted text-muted-foreground',
                        )}
                        id="draft-worktree-enabled"
                        onClick={() => {
                          setUseDraftWorktree((current) => {
                            const next = !current;
                            if (next) {
                              setDraftWorktreeName((name) =>
                                name.trim().length > 0 ? name : createDefaultWorktreeName(),
                              );
                            }
                            return next;
                          });
                        }}
                        role="switch"
                        type="button"
                      >
                        <span
                          className={cn(
                            'size-[18px] rounded-full bg-background shadow-sm transition-transform',
                            useDraftWorktree ? 'translate-x-5' : 'translate-x-0',
                          )}
                        />
                        <span className="sr-only">{useDraftWorktree ? 'Enabled' : 'Disabled'}</span>
                      </button>
                      <Label className="whitespace-nowrap" htmlFor="draft-worktree-enabled">
                        worktree
                      </Label>
                    </div>
                    {useDraftWorktree ? (
                      <div className="min-w-48 flex-1 sm:max-w-96">
                        <Label className="sr-only" htmlFor="draft-worktree-name">
                          Worktree name
                        </Label>
                        <Input
                          aria-describedby={
                            draftWorktreeValidationError !== null
                              ? 'draft-worktree-name-error'
                              : undefined
                          }
                          aria-invalid={draftWorktreeValidationError !== null}
                          id="draft-worktree-name"
                          onChange={(event) => {
                            setDraftWorktreeName(event.target.value);
                          }}
                          placeholder="worktree name"
                          value={draftWorktreeName}
                        />
                        {draftWorktreeValidationError !== null ? (
                          <p
                            className="mt-1 text-xs text-destructive"
                            id="draft-worktree-name-error"
                          >
                            {draftWorktreeValidationError}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <input
                  className="hidden"
                  multiple
                  onChange={handleAttachFileInputChange}
                  ref={attachFileInputRef}
                  type="file"
                />
                <RichPromptEditor
                  disabled={isEditorDisabled}
                  toolbarTrailing={
                    <>
                      <ReviewDialogButton
                        cwd={activeTranscriptCwd}
                        disabled={isEditorDisabled}
                        onInsertReview={handleInsertReviewPrompt}
                        projectId={projectId}
                        reviewSessionId={reviewSessionId}
                      />
                      <Button
                        aria-label="Attach files"
                        disabled={isEditorDisabled || uploadAttachmentsMutation.isPending}
                        onClick={handleOpenAttachFilePicker}
                        size="icon-sm"
                        title="Attach files"
                        type="button"
                        variant="ghost"
                      >
                        {uploadAttachmentsMutation.isPending ? (
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
                        disabled={isEditorDisabled}
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
                  externalValue={promptExternalValue}
                  onSubmit={(value) => {
                    if (canSendPrompt(value)) {
                      void handleSendPrompt(value);
                    }
                  }}
                  onValueReaderReady={handlePromptValueReaderReady}
                  placeholder={shouldUseDraftSession ? 'Start a new session...' : 'Reply...'}
                  projectId={projectId}
                  slashCommands={effectiveSlashCommands}
                  submitKeyBinding={appSettings.submitKeyBinding}
                />

                <div className="flex min-h-9 flex-col gap-1 bg-transparent px-1.5 pt-1 pb-0 sm:px-2">
                  <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                      {shouldUseDraftSession ? (
                        <>
                          <FieldControl
                            className={FORM_SELECT_FIELD_CLASS}
                            htmlFor="draft-provider-select"
                            label="Provider"
                          >
                            <Select
                              onValueChange={(value) => {
                                if (value !== null) {
                                  setDraftPresetId(value);
                                }
                              }}
                              value={activePresetId}
                            >
                              <SelectTrigger
                                className={FORM_SELECT_TRIGGER_CLASS}
                                id="draft-provider-select"
                              >
                                <SelectValue placeholder="Provider" />
                              </SelectTrigger>
                              <SelectContent>
                                {selectablePresets.map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id}>
                                    {preset.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldControl>
                          <FieldControl
                            className={FORM_SELECT_FIELD_CLASS}
                            htmlFor="draft-model-select"
                            label={draftModelSelectLabel}
                          >
                            <Select
                              onValueChange={(value) => {
                                if (!draftModelSourceHasList || value === null) {
                                  return;
                                }
                                setDraftModelId(value);
                              }}
                              value={draftModelSelectValue}
                            >
                              <div className={FORM_SELECT_ROW_CLASS}>
                                <SelectTrigger
                                  className={FORM_SELECT_TRIGGER_CLASS}
                                  disabled={!draftModelSourceHasList}
                                  id="draft-model-select"
                                  title={
                                    !draftModelSourceHasList
                                      ? 'エージェントに問い合わせて一覧を取得中か、利用可能なモデルがありません'
                                      : undefined
                                  }
                                >
                                  <SelectValue
                                    placeholder={
                                      draftModelSourceHasList
                                        ? draftModelSelectLabel
                                        : 'Loading models...'
                                    }
                                  >
                                    {(value) =>
                                      formatAcpSelectValueLabel({
                                        fallback: draftModelSelectLabel,
                                        kind: 'model',
                                        options: draftModelModeListSource.availableModels,
                                        presetId: activePresetId,
                                        value,
                                      })
                                    }
                                  </SelectValue>
                                </SelectTrigger>
                                <AcpSelectValueInfo info={draftModelSelectInfo} />
                              </div>
                              <SelectContent className={MODEL_SELECT_CONTENT_CLASS} side="top">
                                {draftModelSourceHasList ? (
                                  <AcpModelSelectItems
                                    disabled={updateProjectModelPreferenceMutation.isPending}
                                    favoriteModelIds={activePresetFavoriteModelIds}
                                    onToggleFavorite={(modelId, favorite) => {
                                      void handleToggleFavoriteModel({
                                        presetId: activePresetId,
                                        modelId,
                                        currentFavorite: favorite,
                                      });
                                    }}
                                    options={draftModelModeListSource.availableModels}
                                    presetId={activePresetId}
                                  />
                                ) : null}
                              </SelectContent>
                            </Select>
                          </FieldControl>
                          <FieldControl
                            className={FORM_SELECT_FIELD_CLASS}
                            htmlFor="draft-mode-select"
                            label={draftModeSelectLabel}
                          >
                            <Select
                              onValueChange={(value) => {
                                if (!draftModeSourceHasList || value === null) {
                                  return;
                                }
                                setDraftModeId(value);
                              }}
                              value={draftModeSelectValue}
                            >
                              <div className={FORM_SELECT_ROW_CLASS}>
                                <SelectTrigger
                                  className={FORM_SELECT_TRIGGER_CLASS}
                                  disabled={!draftModeSourceHasList}
                                  id="draft-mode-select"
                                  title={
                                    !draftModeSourceHasList
                                      ? 'エージェントに問い合わせて一覧を取得中か、利用可能な mode がありません'
                                      : undefined
                                  }
                                >
                                  <SelectValue
                                    placeholder={
                                      draftModeSourceHasList
                                        ? draftModeSelectLabel
                                        : 'Loading modes...'
                                    }
                                  >
                                    {(value) =>
                                      formatAcpSelectValueLabel({
                                        fallback: draftModeSelectLabel,
                                        kind: 'mode',
                                        options: draftModelModeListSource.availableModes,
                                        presetId: activePresetId,
                                        value,
                                      })
                                    }
                                  </SelectValue>
                                </SelectTrigger>
                                <AcpSelectValueInfo info={draftModeSelectInfo} />
                              </div>
                              <SelectContent>
                                {draftModeSourceHasList
                                  ? draftModelModeListSource.availableModes.map((mode) => (
                                      <SelectItem key={mode.id} value={mode.id}>
                                        <AcpSelectItemLabel>
                                          {formatAcpSelectOptionLabel({
                                            kind: 'mode',
                                            option: mode,
                                            options: draftModelModeListSource.availableModes,
                                            presetId: activePresetId,
                                          })}
                                        </AcpSelectItemLabel>
                                      </SelectItem>
                                    ))
                                  : null}
                              </SelectContent>
                            </Select>
                          </FieldControl>
                        </>
                      ) : selectedSession !== null ? (
                        <>
                          <FieldControl
                            className={FORM_SELECT_FIELD_CLASS}
                            htmlFor="session-model-select"
                            label={sessionModelSelectLabel}
                          >
                            <Select
                              onValueChange={(value) => {
                                if (value !== null) {
                                  void handleUpdateSession({ modelId: value });
                                }
                              }}
                              value={sessionModelSelectValue}
                            >
                              <div className={FORM_SELECT_ROW_CLASS}>
                                <SelectTrigger
                                  className={FORM_SELECT_TRIGGER_CLASS}
                                  id="session-model-select"
                                >
                                  <SelectValue placeholder={sessionModelSelectLabel}>
                                    {(value) =>
                                      formatAcpSelectValueLabel({
                                        fallback: sessionModelSelectLabel,
                                        kind: 'model',
                                        options: selectedSessionAvailableModels,
                                        presetId: selectedSession.presetId,
                                        value,
                                      })
                                    }
                                  </SelectValue>
                                </SelectTrigger>
                                <AcpSelectValueInfo info={sessionModelSelectInfo} />
                              </div>
                              <SelectContent className={MODEL_SELECT_CONTENT_CLASS} side="top">
                                <AcpModelSelectItems
                                  disabled={
                                    selectedSession.presetId === null ||
                                    selectedSession.presetId === undefined ||
                                    updateProjectModelPreferenceMutation.isPending
                                  }
                                  favoriteModelIds={selectedSessionFavoriteModelIds}
                                  onToggleFavorite={(modelId, favorite) => {
                                    void handleToggleFavoriteModel({
                                      presetId: selectedSession.presetId ?? '',
                                      modelId,
                                      currentFavorite: favorite,
                                    });
                                  }}
                                  options={selectedSessionAvailableModels}
                                  presetId={selectedSession.presetId}
                                />
                              </SelectContent>
                            </Select>
                          </FieldControl>
                          {selectedSessionModeOptions.length > 0 ? (
                            <FieldControl
                              className={FORM_SELECT_FIELD_CLASS}
                              htmlFor="session-mode-select"
                              label={sessionModeSelectLabel}
                            >
                              <Select
                                onValueChange={(value) => {
                                  if (value !== null) {
                                    void handleUpdateSession({ modeId: value });
                                  }
                                }}
                                value={sessionModeSelectValue}
                              >
                                <div className={FORM_SELECT_ROW_CLASS}>
                                  <SelectTrigger
                                    className={FORM_SELECT_TRIGGER_CLASS}
                                    id="session-mode-select"
                                  >
                                    <SelectValue placeholder={sessionModeSelectLabel}>
                                      {(value) =>
                                        formatAcpSelectValueLabel({
                                          fallback: sessionModeSelectLabel,
                                          kind: 'mode',
                                          options: selectedSessionModeOptions,
                                          presetId: selectedSession.presetId,
                                          value,
                                        })
                                      }
                                    </SelectValue>
                                  </SelectTrigger>
                                  <AcpSelectValueInfo info={sessionModeSelectInfo} />
                                </div>
                                <SelectContent>
                                  {selectedSessionModeOptions.map((mode) => (
                                    <SelectItem key={mode.id} value={mode.id}>
                                      <AcpSelectItemLabel>
                                        {formatAcpSelectOptionLabel({
                                          kind: 'mode',
                                          option: mode,
                                          options: selectedSessionModeOptions,
                                          presetId: selectedSession.presetId,
                                        })}
                                      </AcpSelectItemLabel>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FieldControl>
                          ) : null}
                          {selectedSession.configOptions.map((option) => {
                            const valueInfo = genericConfigOptionValueInfo(
                              option,
                              option.currentValue,
                            );
                            return (
                              <FieldControl
                                className={FORM_SELECT_FIELD_CLASS}
                                htmlFor={`session-config-select-${option.id}`}
                                key={option.id}
                                label={option.name}
                              >
                                <Select
                                  disabled={!selectedSession.isActive}
                                  onValueChange={(value) => {
                                    if (value !== null) {
                                      void handleUpdateSessionConfigOption({
                                        configId: option.id,
                                        value,
                                      });
                                    }
                                  }}
                                  value={option.currentValue}
                                >
                                  <div className={FORM_SELECT_ROW_CLASS}>
                                    <SelectTrigger
                                      className={FORM_SELECT_TRIGGER_CLASS}
                                      id={`session-config-select-${option.id}`}
                                    >
                                      <SelectValue placeholder={option.name}>
                                        {(value) =>
                                          genericConfigOptionValueLabel(
                                            option,
                                            typeof value === 'string' ? value : null,
                                          )
                                        }
                                      </SelectValue>
                                    </SelectTrigger>
                                    <AcpSelectValueInfo info={valueInfo} />
                                  </div>
                                  <SelectContent>
                                    {option.values.map((candidate) => (
                                      <SelectItem key={candidate.value} value={candidate.value}>
                                        <AcpSelectItemLabel>{candidate.name}</AcpSelectItemLabel>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FieldControl>
                            );
                          })}
                        </>
                      ) : null}
                    </div>

                    {isSelectedSessionRunning && sessionId !== null ? (
                      <Button
                        aria-label="Cancel running turn"
                        className="ml-auto shrink-0"
                        disabled={cancelSessionMutation.isPending}
                        onClick={() => {
                          void handleCancelSession(sessionId);
                        }}
                        size="icon"
                        title="Cancel"
                        type="button"
                        variant="destructive"
                      >
                        {cancelSessionMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Square className="size-4" />
                        )}
                      </Button>
                    ) : (
                      <Button
                        aria-label={
                          isSending ? 'Sending' : shouldUseDraftSession ? 'Start session' : 'Send'
                        }
                        className="ml-auto shrink-0"
                        disabled={!canSend}
                        onClick={() => {
                          void handleSendPrompt();
                        }}
                        size="icon"
                        title={isSending ? 'Sending...' : shouldUseDraftSession ? 'Start' : 'Send'}
                        type="button"
                      >
                        {isSending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Send className="size-4" />
                        )}
                      </Button>
                    )}
                  </div>

                  {shouldUseDraftSession &&
                  (isPreparingDraftProvider ||
                    draftPrepareError !== null ||
                    draftCatalogError !== null) ? (
                    <div className="min-w-0 pr-9">
                      <p
                        className={cn(
                          'text-xs',
                          draftPrepareError !== null || draftCatalogError !== null
                            ? 'text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        {draftPrepareError ??
                          draftCatalogError ??
                          `${draftSession.label} に接続しています...`}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
