import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  Info,
  Loader2,
  Mic,
  MessageSquareDashed,
  Paperclip,
  Send,
  Star,
  Trash2,
  X,
} from "lucide-react";
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
} from "react";
import { toast } from "sonner";

import {
  parseAcpSseEventJson,
  type AcpSseEvent,
  type AgentPreset,
  type AgentModelCatalogResponse,
  type ChatMessage,
  type ChatMessageKind,
  type ModelOption,
  type SessionMessagesResponse,
  type SessionSummary,
  type SessionsResponse,
  type UploadedAttachment,
} from "../../../../shared/acp.ts";
import { ChatMarkdown } from "../../../components/chat-markdown.tsx";
import { Button } from "../../../components/ui/button.tsx";
import { Label } from "../../../components/ui/label.tsx";
import { ScrollArea } from "../../../components/ui/scroll-area.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select.tsx";
import {
  createSessionRequest,
  deleteSessionRequest,
  fetchAgentModelCatalog,
  fetchAgentProviders,
  fetchAppInfo,
  fetchProject,
  fetchProjectSettings,
  fetchSessionMessages,
  fetchSessions,
  prepareAgentSessionRequest,
  sendPromptRequest,
  sendPreparedPromptRequest,
  updateProjectModelPreferenceRequest,
  updateSessionRequest,
  uploadAttachmentsRequest,
} from "../../../lib/api/acp.ts";
import { ACP_SSE_BROWSER_EVENT } from "../../../lib/api/acp-sse-browser-event.ts";
import { cn } from "../../../lib/utils.ts";
import { showAssistantResponseNotification } from "../../../pwa/notifications.ts";
import {
  formatAcpSelectOptionLabel,
  formatAcpSelectValueLabel,
  formatAcpSelectValueInfo,
} from "./acp-select-display.pure.ts";
import { chatMessageClipboardText } from "./chat-block-copy.pure.ts";
import { isNearScrollBottom, nextUnreadMessageCount } from "./chat-scroll.pure.ts";
import {
  appendTranscriptMessage,
  buildDraftSession,
  buildPromptText,
  defaultPresetId,
  draftSessionTranscriptKey,
  moveTranscript,
  resolveSessionListTitle,
  shouldShowConversationLoading,
} from "./chat-state.pure.ts";
import { ChatRawEvents } from "./chat-raw-events.tsx";
import { CopyBlockButton } from "./copy-block-button.tsx";
import {
  filterDisplayableRawEvents,
  shouldDisplayTranscriptMessage,
} from "./transcript-display.pure.ts";
import { mergeToolCallResultMessages } from "./transcript-tool-merge.pure.ts";
import {
  agentModelCatalogQueryKey,
  agentProvidersQueryKey,
  appInfoQueryKey,
  projectQueryKey,
  projectSettingsQueryKey,
  sessionMessagesQueryKey,
  sessionsQueryKey,
} from "./queries.ts";
import { ProjectMenuContent } from "./project-menu-content.tsx";
import { RichPromptEditor } from "./rich-prompt-editor.tsx";
import { appendRichPromptText } from "./rich-prompt-editor.pure.ts";
import { createChatMessage, type TranscriptMap } from "./types.ts";
import { shouldShowMessageCopyButton } from "./message-copy-display.pure.ts";

/** claude-code-viewer の会話カラムと同型（全幅行のうち sm:90% / max-w-3xl で寄せ） */
const CONVERSATION_COLUMN_CLASS = "w-full min-w-0 sm:w-[90%] md:w-[85%] max-w-3xl lg:max-w-4xl";

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
  new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const resolveSpeechRecognitionConstructor = (
  browserWindow: SpeechRecognitionWindow = window,
): SpeechRecognitionConstructor | null =>
  browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;

const finalSpeechTextFromEvent = (event: SpeechRecognitionEvent): string =>
  Array.from(event.results)
    .slice(event.resultIndex)
    .filter((result) => result.isFinal && result.length > 0)
    .map((result) => result[0]?.transcript.trim() ?? "")
    .filter((text) => text.length > 0)
    .join(" ");

const TranscriptMessageBody: FC<{ readonly message: ChatMessage }> = ({ message }) => {
  const displayEvents = filterDisplayableRawEvents(message.rawEvents);
  if (message.role === "user") {
    return <ChatMarkdown>{message.text}</ChatMarkdown>;
  }
  const k: ChatMessageKind = message.kind ?? "legacy_assistant_turn";
  if (k === "legacy_assistant_turn") {
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
  if (k === "reasoning" && message.text.length > 0) {
    return (
      <ChatRawEvents events={[{ type: "reasoning", text: message.text, rawText: message.text }]} />
    );
  }
  if (k === "assistant_text" || k === "tool_input") {
    return message.text.length > 0 ? (
      <div className="text-foreground">
        <ChatMarkdown>{message.text}</ChatMarkdown>
      </div>
    ) : null;
  }
  if (k === "tool_call" || k === "tool_result" || k === "tool_error") {
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
  preset?.modelSelectLabel ?? "Model";

const modeSelectLabelFromPreset = (preset: AgentPreset | null): string =>
  preset?.modeSelectLabel ?? "Mode";

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
          kind: "model",
          option: model,
          options,
          presetId,
        })}
      </AcpSelectItemLabel>
      <button
        aria-label={favorite ? "Unpin model" : "Pin model"}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          favorite ? "text-amber-500 hover:text-amber-500" : "",
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
        title={favorite ? "Pinned から外す" : "Pinned に追加"}
        type="button"
      >
        <Star aria-hidden="true" className={cn("size-3.5", favorite ? "fill-current" : "")} />
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

const FieldControl: FC<{
  readonly className?: string;
  readonly htmlFor: string;
  readonly label: string;
  readonly children: ReactNode;
}> = ({ className, htmlFor, label, children }) => (
  <div className={cn("min-w-32 flex-1 sm:min-w-40 sm:flex-none", className)}>
    <Label className="sr-only" htmlFor={htmlFor}>
      {label}
    </Label>
    {children}
  </div>
);

const MODEL_SELECT_CONTENT_CLASS = "w-[min(90vw,32rem)] min-w-[min(90vw,32rem)]";

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
  const navigate = useNavigate({ from: "/projects/$projectId" });

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
  const { data: providerData } = useSuspenseQuery({
    queryKey: agentProvidersQueryKey,
    queryFn: fetchAgentProviders,
  });
  const { data: sessionsData } = useSuspenseQuery({
    queryKey: sessionsQueryKey,
    queryFn: fetchSessions,
  });

  const project = projectData.project;
  const projectSettings = projectSettingsData.settings;
  const selectablePresets = useMemo(
    () => providerData.providers.filter((entry) => entry.enabled).map((entry) => entry.preset),
    [providerData.providers],
  );
  const preferredPresetId = defaultPresetId(selectablePresets);

  const [draftPresetId, setDraftPresetId] = useState("");
  const [draftModelId, setDraftModelId] = useState<string | null>(null);
  const [draftModeId, setDraftModeId] = useState<string | null>(null);
  const [pendingTuningModelId, setPendingTuningModelId] = useState<string | null>(null);
  const [pendingTuningModeId, setPendingTuningModeId] = useState<string | null>(null);
  const promptReaderRef = useRef<() => string>(() => "");
  const [promptExternalValue, setPromptExternalValue] = useState({
    revision: 0,
    value: "",
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
  const previousVisibleMessageCountRef = useRef(0);
  const [isChatFollowingTail, setIsChatFollowingTail] = useState(true);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  const onAgentCatalogReady = useCallback((catalog: AgentModelCatalogResponse) => {
    setProbedModelCatalog(catalog);
  }, []);

  const replacePrompt = useCallback((value: string) => {
    setPromptExternalValue((current) => ({
      revision: current.revision + 1,
      value,
    }));
  }, []);

  const handlePromptValueReaderReady = useCallback((readValue: () => string) => {
    promptReaderRef.current = readValue;
  }, []);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.abort();
    };
  }, []);

  const projectSessions = useMemo(
    () =>
      sessionsData.sessions
        .filter((session) => session.projectId === projectId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [projectId, sessionsData.sessions],
  );
  /** サイドバー用は `projectSessions` だが、URL の `session-id` との対応づけは全セッションから行う。 */
  const selectedSession =
    sessionId === null
      ? null
      : (projectSessions.find((s) => s.sessionId === sessionId) ??
        sessionsData.sessions.find((s) => s.sessionId === sessionId) ??
        null);
  const shouldUseDraftSession = sessionId === null;
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
        .sort((left, right) => (right.lastUsedAt ?? "").localeCompare(left.lastUsedAt ?? ""))[0]
        ?.modelId ?? null,
    [activePresetModelPreferences],
  );

  const draftCatalogScopeKey = `${projectId}\0${activePresetId}`;
  const preparedSessionScopeKey = `${projectId}\0${activePresetId}\0${project.workingDirectory}`;

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
    if (!shouldUseDraftSession || activePresetId.length === 0) {
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
          [preparedSessionScopeKey]: "Provider preconnect failed. Check Settings or agent auth.",
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
    shouldUseDraftSession,
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
      availableModes: c?.availableModes ?? [],
      currentModelId: c?.currentModelId ?? null,
      currentModeId: c?.currentModeId ?? null,
    };
  }, [activePresetFavoriteModelIds, activePresetLastUsedModelId, probedModelCatalog]);

  const draftModelSourceHasList = draftModelModeListSource.availableModels.length > 0;
  const draftModeSourceHasList = draftModelModeListSource.availableModes.length > 0;
  const isPreparingDraftProvider =
    shouldUseDraftSession && preparingScopesByKey[preparedSessionScopeKey] === true;
  const draftPrepareError = prepareErrorsByScope[preparedSessionScopeKey] ?? null;
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
  const selectedSessionAvailableModels = useMemo(
    () =>
      orderModelOptions({
        options: selectedSession?.availableModels ?? [],
        favoriteModelIds: selectedSessionFavoriteModelIds,
        lastUsedModelId: selectedSession?.currentModelId ?? null,
      }),
    [selectedSession, selectedSessionFavoriteModelIds],
  );
  const draftModelSelectInfo = formatAcpSelectValueInfo({
    kind: "model",
    options: draftModelModeListSource.availableModels,
    presetId: activePresetId,
    value: draftModelSelectValue,
  });
  const draftModeSelectInfo = formatAcpSelectValueInfo({
    kind: "mode",
    options: draftModelModeListSource.availableModes,
    presetId: activePresetId,
    value: draftModeSelectValue,
  });
  const sessionModelSelectInfo = formatAcpSelectValueInfo({
    kind: "model",
    options: selectedSessionAvailableModels,
    presetId: selectedSession?.presetId,
    value: sessionModelSelectValue,
  });
  const sessionModeSelectInfo = formatAcpSelectValueInfo({
    kind: "mode",
    options: selectedSession?.availableModes ?? [],
    presetId: selectedSession?.presetId,
    value: sessionModeSelectValue,
  });
  const activeTranscriptKey = sessionId ?? draftSessionTranscriptKey;

  const transcript = transcripts[activeTranscriptKey] ?? [];
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
        message.updatedAt ?? "",
        message.text.length,
        message.rawEvents.length,
        message.rawEvents.map((event) => event.rawText.length).join("."),
      ].join(":"),
    )
    .join("|");
  const projectUrl = `/projects/${projectId}`;

  const navigateToSession = useCallback(
    (nextSessionId: string | null, options: { readonly replace?: boolean } = {}) => {
      void navigate({
        search: { "session-id": nextSessionId ?? undefined },
        replace: options.replace === true,
      });
    },
    [navigate],
  );

  useEffect(() => {
    setDraftModelId(null);
    setDraftModeId(null);
  }, [activePresetId]);

  useEffect(() => {
    setPendingTuningModelId(null);
    setPendingTuningModeId(null);
  }, [selectedSession?.sessionId]);

  const createSessionMutation = useMutation({
    mutationFn: createSessionRequest,
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

  const closeSessionMutation = useMutation({
    mutationFn: deleteSessionRequest,
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

  const isSending =
    createSessionMutation.isPending ||
    sendPromptMutation.isPending ||
    sendPreparedPromptMutation.isPending ||
    updateSessionMutation.isPending ||
    uploadAttachmentsMutation.isPending;
  const isAssistantRequestPending =
    createSessionMutation.isPending ||
    sendPromptMutation.isPending ||
    sendPreparedPromptMutation.isPending;
  const isEditorDisabled = isAssistantRequestPending;
  const isAwaitingActiveAssistantResponse =
    isAssistantRequestPending && awaitingAssistantTranscriptKeys.includes(activeTranscriptKey);
  const isSelectedSessionRunning =
    !shouldUseDraftSession && selectedSession !== null && selectedSession.status === "running";
  const shouldShowThinking = isAwaitingActiveAssistantResponse || isSelectedSessionRunning;
  const shouldShowScrollBanner =
    !isChatFollowingTail && (visibleTranscript.length > 0 || shouldShowThinking);
  const scrollBannerMessageCount =
    unreadMessageCount > 0 ? unreadMessageCount : Math.max(1, visibleTranscript.length);
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
      if (sseEvent.type === "agent_catalog_updated" || sseEvent.type === "session_removed") {
        return;
      }
      const nextSessionId = sseEvent.sessionId;
      setAwaitingAssistantTranscriptKeys((current) =>
        current.includes(nextSessionId) ? current : [...current, nextSessionId],
      );
      setTranscripts((current) =>
        current[nextSessionId] === undefined
          ? moveTranscript({
              from: draftSessionTranscriptKey,
              to: nextSessionId,
              transcripts: current,
            })
          : current,
      );
      navigateToSession(nextSessionId);
    };

    window.addEventListener(ACP_SSE_BROWSER_EVENT, onAcpSseEvent);
    return () => {
      window.removeEventListener(ACP_SSE_BROWSER_EVENT, onAcpSseEvent);
    };
  }, [isAssistantRequestPending, navigateToSession, shouldUseDraftSession]);
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
      buildPromptText(value, attachmentNames).length > 0 &&
      !isSending &&
      (!shouldUseDraftSession || activePresetId.length > 0),
    [activePresetId, attachmentNames, isSending, shouldUseDraftSession],
  );
  const canSend = !isSending && (!shouldUseDraftSession || activePresetId.length > 0);

  const thinkingModelLabel = useMemo((): string => {
    if (shouldUseDraftSession) {
      if (!draftModelSourceHasList) {
        return "Model";
      }
      const id =
        draftModelId ??
        draftModelModeListSource.currentModelId ??
        draftModelModeListSource.availableModels[0]?.id;
      const found =
        id !== undefined
          ? draftModelModeListSource.availableModels.find((m) => m.id === id)
          : undefined;
      return found?.name ?? id ?? "Model";
    }
    if (selectedSession !== null) {
      const id = selectedSession.currentModelId;
      const found =
        id !== undefined ? selectedSession.availableModels.find((m) => m.id === id) : undefined;
      return found?.name ?? id ?? "Model";
    }
    return "Model";
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
      toast.error("このブラウザは音声入力に対応していません");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language.length > 0 ? navigator.language : "ja-JP";
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
      if (event.error !== "aborted") {
        toast.error(event.message.length > 0 ? event.message : "音声入力に失敗しました");
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
      toast.error("音声入力を開始できませんでした");
    }
  };

  const handleAttachFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = input.files === null ? [] : [...input.files];
    if (files.length === 0) {
      return;
    }

    void handleAttachFiles(files).finally(() => {
      input.value = "";
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
      if (modelId !== undefined) {
        void queryClient.invalidateQueries({ queryKey: projectSettingsQueryKey(projectId) });
      }
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

  const handleSendPrompt = async (promptValue = promptReaderRef.current()) => {
    const nextPrompt = buildPromptText(promptValue, attachmentNames);
    if (nextPrompt.length === 0) {
      return;
    }

    const previousPrompt = promptValue;
    const userMessage = createChatMessage("user", nextPrompt, [], { kind: "user" });
    const initialTranscriptKey = activeTranscriptKey;

    shouldStickToBottomRef.current = true;
    setIsChatFollowingTail(true);
    setAwaitingAssistantTranscriptKeys([initialTranscriptKey]);
    speechRecognitionRef.current?.stop();
    setIsListeningToSpeech(false);
    replacePrompt("");
    setTranscripts((current) =>
      appendTranscriptMessage({
        message: userMessage,
        transcriptKey: initialTranscriptKey,
        transcripts: current,
      }),
    );

    const sessionForTuning = selectedSession;
    let activeSessionId = sessionId;

    try {
      if (activeSessionId === null) {
        const preparedSessionId = preparedSessionIdsByScope[preparedSessionScopeKey];
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
            draftModelModeListSource.currentModeId ??
            draftModelModeListSource.availableModes[0]?.id ??
            undefined)
          : undefined;
        if (preparedSessionId !== undefined) {
          const response = await sendPreparedPromptMutation.mutateAsync({
            attachmentIds: attachedFiles.map((attachment) => attachment.attachmentId),
            prepareId: preparedSessionId,
            nextPrompt,
            modelId: modelIdForCreate,
            modeId: modeIdForCreate,
          });

          activeSessionId = response.session.sessionId;
          setAwaitingAssistantTranscriptKeys([initialTranscriptKey, response.session.sessionId]);
          upsertSessionInCache(response.session);
          setTranscripts((current) =>
            moveTranscript({
              from: draftSessionTranscriptKey,
              to: response.session.sessionId,
              transcripts: current,
            }),
          );
          navigateToSession(response.session.sessionId);
          if (document.visibilityState === "hidden") {
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
          setAttachedFiles([]);
          setAwaitingAssistantTranscriptKeys([]);
          return;
        }
        const sessionResponse = await createSessionMutation.mutateAsync({
          projectId: project.id,
          presetId: draftSession.presetId,
          command: null,
          argsText: "",
          cwd: project.workingDirectory,
          modelId: modelIdForCreate,
          modeId: modeIdForCreate,
        });

        activeSessionId = sessionResponse.session.sessionId;
        setAwaitingAssistantTranscriptKeys([
          initialTranscriptKey,
          sessionResponse.session.sessionId,
        ]);
        upsertSessionInCache(sessionResponse.session);
        setTranscripts((current) =>
          moveTranscript({
            from: draftSessionTranscriptKey,
            to: sessionResponse.session.sessionId,
            transcripts: current,
          }),
        );
        navigateToSession(sessionResponse.session.sessionId);
      }

      if (activeSessionId === null) {
        throw new Error("failed to resolve active session");
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
        attachmentIds: attachedFiles.map((attachment) => attachment.attachmentId),
        sessionId: resolvedActiveSessionId,
        nextPrompt,
        ...inactiveTuning,
      });

      upsertSessionInCache(response.session);
      if (document.visibilityState === "hidden") {
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
      setAttachedFiles([]);
      setAwaitingAssistantTranscriptKeys([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to send prompt";
      setAwaitingAssistantTranscriptKeys([]);
      replacePrompt(previousPrompt);
      setTranscripts((current) =>
        appendTranscriptMessage({
          message: createChatMessage("assistant", `Error: ${message}`, [], {
            kind: "legacy_assistant_turn",
          }),
          transcriptKey: activeSessionId ?? draftSessionTranscriptKey,
          transcripts: current,
        }),
      );

      if (document.visibilityState === "hidden") {
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
    transcripts[targetSessionId]?.find((message) => message.role === "user")?.text ?? null;
  const pageTitle = shouldUseDraftSession
    ? "New session"
    : selectedSession !== null
      ? resolveSessionListTitle(
          selectedSession,
          firstUserTextInTranscript(selectedSession.sessionId),
        )
      : sessionId !== null
        ? (firstUserTextInTranscript(sessionId) ?? sessionId)
        : "Session";
  const pageAgentLabel = shouldUseDraftSession
    ? draftSession.label
    : (selectedSessionPreset?.label ??
      selectedSession?.presetId ??
      selectedSession?.command ??
      "custom");

  const handleChatScroll: UIEventHandler<HTMLDivElement> = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.dataset["slot"] !== "scroll-area-viewport") {
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
  };

  const handleJumpToLatest = () => {
    shouldStickToBottomRef.current = true;
    setIsChatFollowingTail(true);
    setUnreadMessageCount(0);
    scrollAnchorRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
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
  }, [chatScrollSignature, visibleTranscript.length]);

  useLayoutEffect(() => {
    const didSessionChange = lastActiveTranscriptKeyRef.current !== activeTranscriptKey;
    if (didSessionChange) {
      lastActiveTranscriptKeyRef.current = activeTranscriptKey;
      shouldStickToBottomRef.current = true;
      setIsChatFollowingTail(true);
      setUnreadMessageCount(0);
      previousVisibleMessageCountRef.current = visibleTranscript.length;
    }
    if (!shouldStickToBottomRef.current) {
      return;
    }
    scrollAnchorRef.current?.scrollIntoView({ block: "end" });
  }, [
    activeTranscriptKey,
    chatScrollSignature,
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
      <ProjectMenuContent
        currentSessionId={sessionId}
        projectId={projectId}
        sessionCount={projectSessions.length}
        sessions={projectSessions}
      />
      <div className="flex h-full flex-col px-2 py-2 md:px-3">
        <header className="flex h-10 shrink-0 items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight">{pageTitle}</h1>
            <span className="shrink-0 text-xs text-muted-foreground">{pageAgentLabel}</span>
          </div>
          {sessionId !== null ? (
            <Button
              aria-label="Close session"
              className="shrink-0"
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
                    "space-y-5 px-1 pt-3 md:space-y-6 md:px-2",
                    shouldShowScrollBanner ? "pb-10" : "pb-2",
                  )}
                  ref={chatContentRef}
                >
                  {isTranscriptHydrating ? <LoadingConversation /> : null}
                  {!isTranscriptHydrating && transcript.length === 0 && !shouldShowThinking ? (
                    <div className="mx-auto max-w-md rounded-lg border border-dashed border-border/70 bg-card/60 px-6 py-12 text-center">
                      <MessageSquareDashed className="mx-auto mb-3 size-8 text-muted-foreground/80" />
                      <p className="text-sm font-medium text-foreground/90">No messages</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        下の欄に入力して会話を始められます
                      </p>
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

                  {visibleTranscript.map((message) => {
                    const isUser = message.role === "user";
                    return (
                      <div
                        className={cn(
                          "group/message flex w-full",
                          isUser ? "justify-end" : "justify-start",
                        )}
                        key={message.id}
                      >
                        <div
                          className={cn(
                            "flex min-w-0 flex-col gap-1",
                            CONVERSATION_COLUMN_CLASS,
                            isUser ? "items-stretch" : "items-stretch",
                          )}
                        >
                          <div
                            className={cn(
                              "flex w-full items-center gap-1",
                              isUser ? "justify-end" : "justify-start",
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
                              <TranscriptMessageBody message={message} />
                            </div>
                          ) : (
                            <div className="w-full min-w-0 text-card-foreground">
                              <TranscriptMessageBody message={message} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {shouldShowThinking ? (
                    <div
                      className={cn(
                        "flex w-full min-w-0 flex-col",
                        CONVERSATION_COLUMN_CLASS,
                        "pl-0.5",
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

            <div className="bg-transparent px-1 pt-0 pb-1 md:px-2 md:pb-1.5">
              <div className="overflow-hidden">
                {attachedFiles.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/15 px-3 py-2">
                    {attachedFiles.map((attachment) => (
                      <span
                        className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-foreground"
                        key={attachment.attachmentId}
                      >
                        <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                        <span className="max-w-48 truncate">{attachment.name}</span>
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
                        aria-label={isListeningToSpeech ? "Stop voice input" : "Start voice input"}
                        className={cn(
                          isListeningToSpeech
                            ? "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                            : "",
                        )}
                        disabled={isEditorDisabled}
                        onClick={handleToggleSpeechInput}
                        size="icon-sm"
                        title={isListeningToSpeech ? "音声入力を停止" : "音声入力"}
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
                  placeholder={shouldUseDraftSession ? "Start a new session..." : "Reply..."}
                />

                <div className="flex min-h-9 items-end gap-1.5 bg-transparent px-1.5 py-1 sm:px-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {shouldUseDraftSession ? (
                        <>
                          <FieldControl htmlFor="draft-provider-select" label="Provider">
                            <Select
                              onValueChange={(value) => {
                                if (value !== null) {
                                  setDraftPresetId(value);
                                }
                              }}
                              value={activePresetId}
                            >
                              <SelectTrigger className="w-full" id="draft-provider-select">
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
                          <FieldControl htmlFor="draft-model-select" label={draftModelSelectLabel}>
                            <Select
                              onValueChange={(value) => {
                                if (!draftModelSourceHasList || value === null) {
                                  return;
                                }
                                setDraftModelId(value);
                              }}
                              value={draftModelSelectValue}
                            >
                              <div className="flex items-center gap-1.5">
                                <SelectTrigger
                                  className="min-w-0 flex-1"
                                  disabled={!draftModelSourceHasList}
                                  id="draft-model-select"
                                  title={
                                    !draftModelSourceHasList
                                      ? "エージェントに問い合わせて一覧を取得中か、利用可能なモデルがありません"
                                      : undefined
                                  }
                                >
                                  <SelectValue
                                    placeholder={
                                      draftModelSourceHasList
                                        ? draftModelSelectLabel
                                        : "Loading models..."
                                    }
                                  >
                                    {(value) =>
                                      formatAcpSelectValueLabel({
                                        fallback: draftModelSelectLabel,
                                        kind: "model",
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
                          <FieldControl htmlFor="draft-mode-select" label={draftModeSelectLabel}>
                            <Select
                              onValueChange={(value) => {
                                if (!draftModeSourceHasList || value === null) {
                                  return;
                                }
                                setDraftModeId(value);
                              }}
                              value={draftModeSelectValue}
                            >
                              <div className="flex items-center gap-1.5">
                                <SelectTrigger
                                  className="min-w-0 flex-1"
                                  disabled={!draftModeSourceHasList}
                                  id="draft-mode-select"
                                  title={
                                    !draftModeSourceHasList
                                      ? "エージェントに問い合わせて一覧を取得中か、利用可能な mode がありません"
                                      : undefined
                                  }
                                >
                                  <SelectValue
                                    placeholder={
                                      draftModeSourceHasList
                                        ? draftModeSelectLabel
                                        : "Loading modes..."
                                    }
                                  >
                                    {(value) =>
                                      formatAcpSelectValueLabel({
                                        fallback: draftModeSelectLabel,
                                        kind: "mode",
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
                                            kind: "mode",
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
                              <div className="flex items-center gap-1.5">
                                <SelectTrigger className="min-w-0 flex-1" id="session-model-select">
                                  <SelectValue placeholder={sessionModelSelectLabel}>
                                    {(value) =>
                                      formatAcpSelectValueLabel({
                                        fallback: sessionModelSelectLabel,
                                        kind: "model",
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
                                      presetId: selectedSession.presetId ?? "",
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
                          {selectedSession.availableModes.length > 0 ? (
                            <FieldControl
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
                                <div className="flex items-center gap-1.5">
                                  <SelectTrigger
                                    className="min-w-0 flex-1"
                                    id="session-mode-select"
                                  >
                                    <SelectValue placeholder={sessionModeSelectLabel}>
                                      {(value) =>
                                        formatAcpSelectValueLabel({
                                          fallback: sessionModeSelectLabel,
                                          kind: "mode",
                                          options: selectedSession.availableModes,
                                          presetId: selectedSession.presetId,
                                          value,
                                        })
                                      }
                                    </SelectValue>
                                  </SelectTrigger>
                                  <AcpSelectValueInfo info={sessionModeSelectInfo} />
                                </div>
                                <SelectContent>
                                  {selectedSession.availableModes.map((mode) => (
                                    <SelectItem key={mode.id} value={mode.id}>
                                      <AcpSelectItemLabel>
                                        {formatAcpSelectOptionLabel({
                                          kind: "mode",
                                          option: mode,
                                          options: selectedSession.availableModes,
                                          presetId: selectedSession.presetId,
                                        })}
                                      </AcpSelectItemLabel>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FieldControl>
                          ) : null}
                        </>
                      ) : null}
                    </div>

                    {shouldUseDraftSession &&
                    (isPreparingDraftProvider ||
                      draftPrepareError !== null ||
                      draftCatalogError !== null) ? (
                      <p
                        className={
                          draftPrepareError !== null || draftCatalogError !== null
                            ? "text-xs text-destructive"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {draftPrepareError ??
                          draftCatalogError ??
                          `${draftSession.label} に接続しています...`}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    aria-label={
                      isSending ? "Sending" : shouldUseDraftSession ? "Start session" : "Send"
                    }
                    className="shrink-0"
                    disabled={!canSend}
                    onClick={() => {
                      void handleSendPrompt();
                    }}
                    size="icon"
                    title={isSending ? "Sending..." : shouldUseDraftSession ? "Start" : "Send"}
                    type="button"
                  >
                    {isSending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
