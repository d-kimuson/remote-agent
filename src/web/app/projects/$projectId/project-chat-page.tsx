import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  History as HistoryIcon,
  MessageSquareDashed,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Trash2,
} from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type FC,
} from "react";

import type {
  AgentModelCatalogResponse,
  ChatMessage,
  ChatMessageKind,
  SessionSummary,
  SessionsResponse,
  UploadedAttachment,
} from "../../../../shared/acp.ts";
import { Badge } from "../../../components/ui/badge.tsx";
import { Button, buttonVariants } from "../../../components/ui/button.tsx";
import { ScrollArea } from "../../../components/ui/scroll-area.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select.tsx";
import { Textarea } from "../../../components/ui/textarea.tsx";
import {
  createSessionRequest,
  deleteSessionRequest,
  fetchAgentModelCatalog,
  fetchAppInfo,
  fetchProject,
  fetchResumableSessions,
  fetchSessionMessages,
  fetchSessions,
  loadSessionRequest,
  sendPromptRequest,
  updateSessionRequest,
  uploadAttachmentsRequest,
} from "../../../lib/api/acp.ts";
import { cn } from "../../../lib/utils.ts";
import { showAssistantResponseNotification } from "../../../pwa/notifications.ts";
import { AttachFilesDialog } from "./attach-files-dialog.tsx";
import {
  appendTranscriptMessage,
  buildDraftSession,
  buildPromptText,
  buildSessionEntries,
  defaultPresetId,
  draftSessionTranscriptKey,
  moveTranscript,
  resolveSessionListTitle,
} from "./chat-state.pure.ts";
import { ChatRawEvents } from "./chat-raw-events.tsx";
import { LoadSessionDialog } from "./load-session-dialog.tsx";
import {
  filterDisplayableRawEvents,
  shouldDisplayTranscriptMessage,
} from "./transcript-display.pure.ts";
import { mergeToolCallResultMessages } from "./transcript-tool-merge.pure.ts";
import {
  agentModelCatalogQueryKey,
  appInfoQueryKey,
  projectQueryKey,
  sessionMessagesQueryKey,
  sessionsQueryKey,
} from "./queries.ts";
import { SessionListItem } from "./session-list-item.tsx";
import { createChatMessage, type TranscriptMap } from "./types.ts";

/** 既存セッションからモデル/モード一覧を借りられないときの Select 用プレースホルダー（送信時は undefined を送る） */
const DRAFT_FALLBACK_SELECT_VALUE = "__acp_agent_default__";

/** claude-code-viewer の会話カラムと同型（全幅行のうち sm:90% / max-w-3xl で寄せ） */
const CONVERSATION_COLUMN_CLASS = "w-full min-w-0 sm:w-[90%] md:w-[85%] max-w-3xl lg:max-w-4xl";

const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const TranscriptMessageBody: FC<{ readonly message: ChatMessage }> = ({ message }) => {
  const displayEvents = filterDisplayableRawEvents(message.rawEvents);
  if (message.role === "user") {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>;
  }
  const k: ChatMessageKind = message.kind ?? "legacy_assistant_turn";
  if (k === "legacy_assistant_turn") {
    return (
      <div className="flex w-full flex-col gap-3">
        {displayEvents.length > 0 ? <ChatRawEvents events={message.rawEvents} /> : null}
        {message.text.length > 0 ? (
          <div className="w-full px-0.5 sm:px-1">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground [text-wrap:pretty]">
              {message.text}
            </p>
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
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{message.text}</p>
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

const presetLabelFrom = ({
  presetId,
  presets,
}: {
  readonly presetId: string | null | undefined;
  readonly presets: readonly { readonly id: string; readonly label: string }[];
}): string => presets.find((preset) => preset.id === presetId)?.label ?? presetId ?? "custom";

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

  useEffect(() => {
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
  const { data: appInfoData } = useSuspenseQuery({
    queryKey: appInfoQueryKey,
    queryFn: fetchAppInfo,
  });
  const { data: sessionsData, refetch: refetchSessions } = useSuspenseQuery({
    queryKey: sessionsQueryKey,
    queryFn: fetchSessions,
  });

  const project = projectData.project;
  const preferredPresetId = defaultPresetId(appInfoData.agentPresets);

  const [draftPresetId, setDraftPresetId] = useState("");
  const [draftModelId, setDraftModelId] = useState<string | null>(null);
  const [draftModeId, setDraftModeId] = useState<string | null>(null);
  const [pendingTuningModelId, setPendingTuningModelId] = useState<string | null>(null);
  const [pendingTuningModeId, setPendingTuningModeId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [transcripts, setTranscripts] = useState<TranscriptMap>({});
  const [attachedFiles, setAttachedFiles] = useState<readonly UploadedAttachment[]>([]);
  const [isAttachDialogOpen, setIsAttachDialogOpen] = useState(false);
  const [isLoadSessionDialogOpen, setIsLoadSessionDialogOpen] = useState(false);
  const [probedModelCatalog, setProbedModelCatalog] = useState<AgentModelCatalogResponse | null>(
    null,
  );

  const onAgentCatalogReady = useCallback((catalog: AgentModelCatalogResponse) => {
    setProbedModelCatalog(catalog);
  }, []);

  const projectSessions = useMemo(
    () =>
      sessionsData.sessions
        .filter((session) => session.projectId === projectId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [projectId, sessionsData.sessions],
  );
  const selectedSession =
    sessionId === null
      ? null
      : (projectSessions.find((session) => session.sessionId === sessionId) ?? null);
  const shouldUseDraftSession = selectedSession === null;
  const activePresetId = draftPresetId.length > 0 ? draftPresetId : preferredPresetId;
  const draftSession = useMemo(
    () =>
      buildDraftSession({
        cwd: project.workingDirectory,
        presetId: activePresetId,
        presets: appInfoData.agentPresets,
      }),
    [activePresetId, appInfoData.agentPresets, project.workingDirectory],
  );
  const sessionEntries = useMemo(
    () =>
      buildSessionEntries({
        draftSession,
        sessions: projectSessions,
      }),
    [draftSession, projectSessions],
  );
  const modelModeTemplateSession = useMemo((): SessionSummary | null => {
    const inProject = projectSessions.find((entry) => entry.presetId === activePresetId);
    if (inProject !== undefined) {
      return inProject;
    }
    if (projectSessions[0] !== undefined) {
      return projectSessions[0];
    }
    return (
      sessionsData.sessions.find((entry) => entry.presetId === activePresetId) ??
      sessionsData.sessions[0] ??
      null
    );
  }, [activePresetId, projectSessions, sessionsData.sessions]);

  const draftCatalogScopeKey = `${projectId}\0${activePresetId}`;

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

  /** 永続セッションが 0 件でも initSession 由来の一覧を使えるように、既存サマリと probe をマージ。 */
  const draftModelModeListSource = useMemo(() => {
    const t = modelModeTemplateSession;
    const c = probedModelCatalog;
    if (t === null) {
      return {
        availableModels: c?.availableModels ?? [],
        availableModes: c?.availableModes ?? [],
        currentModelId: c?.currentModelId ?? null,
        currentModeId: c?.currentModeId ?? null,
      };
    }
    const modelsFromSession = t.availableModels.length > 0;
    const modesFromSession = t.availableModes.length > 0;
    return {
      availableModels: modelsFromSession
        ? t.availableModels
        : (c?.availableModels ?? t.availableModels),
      availableModes: modesFromSession ? t.availableModes : (c?.availableModes ?? t.availableModes),
      currentModelId:
        (modelsFromSession ? t.currentModelId : c?.currentModelId) ?? t.currentModelId ?? null,
      currentModeId:
        (modesFromSession ? t.currentModeId : c?.currentModeId) ?? t.currentModeId ?? null,
    };
  }, [modelModeTemplateSession, probedModelCatalog]);

  const draftModelSourceHasList = draftModelModeListSource.availableModels.length > 0;
  const draftModeSourceHasList = draftModelModeListSource.availableModes.length > 0;

  const activeTranscriptKey = shouldUseDraftSession
    ? draftSessionTranscriptKey
    : selectedSession.sessionId;

  const transcript = transcripts[activeTranscriptKey] ?? [];
  const mergedForDisplay = mergeToolCallResultMessages(transcript);
  const visibleTranscript = mergedForDisplay.filter((message) => {
    const d = filterDisplayableRawEvents(message.rawEvents);
    return shouldDisplayTranscriptMessage(message, d);
  });
  const projectUrl = `/projects/${projectId}`;

  const navigateToSession = (nextSessionId: string | null) => {
    void navigate({
      search: { "session-id": nextSessionId ?? undefined },
      replace: false,
    });
  };

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

  const closeSessionMutation = useMutation({
    mutationFn: deleteSessionRequest,
  });

  const loadSessionMutation = useMutation({
    mutationFn: loadSessionRequest,
  });

  const discoverResumableSessionsMutation = useMutation({
    mutationFn: fetchResumableSessions,
  });

  const sendPromptMutation = useMutation({
    mutationFn: ({
      attachmentIds,
      modeId: tuningModeId,
      modelId: tuningModelId,
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
        modeId: tuningModeId,
        modelId: tuningModelId,
        prompt: nextPrompt,
      }),
  });

  const uploadAttachmentsMutation = useMutation({
    mutationFn: uploadAttachmentsRequest,
  });

  const isSending =
    createSessionMutation.isPending ||
    sendPromptMutation.isPending ||
    updateSessionMutation.isPending ||
    uploadAttachmentsMutation.isPending;
  const isAwaitingAssistantResponse =
    createSessionMutation.isPending || sendPromptMutation.isPending;
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
        if (messages.length === 0 && isAwaitingAssistantResponse) {
          return current;
        }
        return {
          ...current,
          [targetSessionId]: messages.map((message) => ({ ...message })),
        };
      });
    },
    [isAwaitingAssistantResponse],
  );
  const attachmentNames = attachedFiles.map((attachment) => attachment.name);
  const canSend = buildPromptText(prompt, attachmentNames).length > 0 && !isSending;

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

  const handleAttachFiles = async (files: readonly File[]) => {
    const response = await uploadAttachmentsMutation.mutateAsync(files);
    setAttachedFiles((current) => [...current, ...response.attachments]);
  };

  const handleRemoveFile = (attachmentId: string) => {
    setAttachedFiles((current) =>
      current.filter((attachment) => attachment.attachmentId !== attachmentId),
    );
  };

  const handleSelectExistingSession = (nextSessionId: string) => {
    navigateToSession(nextSessionId);
  };

  const handleStartDraftSession = () => {
    navigateToSession(null);
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

  const handleLoadExistingSession = async ({
    sessionId: targetSessionId,
    title,
    updatedAt,
  }: {
    readonly sessionId: string;
    readonly title: string | null;
    readonly updatedAt: string | null;
  }) => {
    const response = await loadSessionMutation.mutateAsync({
      projectId,
      presetId: "codex",
      sessionId: targetSessionId,
      cwd: project.workingDirectory,
      title,
      updatedAt,
    });

    upsertSessionInCache(response.session);
    setIsLoadSessionDialogOpen(false);
    navigateToSession(response.session.sessionId);
    void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
  };

  const handleOpenLoadSessionDialog = () => {
    setIsLoadSessionDialogOpen(true);
    discoverResumableSessionsMutation.mutate({
      projectId,
      presetId: "codex",
      cwd: project.workingDirectory,
    });
  };

  const handleSendPrompt = async () => {
    const nextPrompt = buildPromptText(prompt, attachmentNames);
    if (nextPrompt.length === 0) {
      return;
    }

    const previousPrompt = prompt;
    const userMessage = createChatMessage("user", nextPrompt, [], { kind: "user" });
    const initialTranscriptKey = activeTranscriptKey;

    setPrompt("");
    setTranscripts((current) =>
      appendTranscriptMessage({
        message: userMessage,
        transcriptKey: initialTranscriptKey,
        transcripts: current,
      }),
    );

    const sessionForTuning = selectedSession;
    let activeSessionId = selectedSession?.sessionId ?? null;

    try {
      if (activeSessionId === null) {
        const modelIdForCreate = draftModelSourceHasList
          ? (draftModelId ??
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
      void queryClient.invalidateQueries({
        queryKey: sessionMessagesQueryKey(resolvedActiveSessionId),
      });
      setPendingTuningModelId(null);
      setPendingTuningModeId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to send prompt";
      setPrompt(previousPrompt);
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

  const headerSubtitle = shouldUseDraftSession
    ? draftSession.label
    : `${presetLabelFrom({ presetId: selectedSession.presetId, presets: appInfoData.agentPresets })} · ${selectedSession.command} · ${formatDateTime(selectedSession.createdAt)}`;

  const firstUserTextInTranscript = (targetSessionId: string) =>
    transcripts[targetSessionId]?.find((message) => message.role === "user")?.text ?? null;

  return (
    <div className="min-h-screen bg-background">
      {shouldUseDraftSession && (
        <Suspense fallback={null}>
          <DraftAgentModelCatalogLoader
            key={draftCatalogScopeKey}
            presetId={activePresetId}
            projectId={projectId}
            onReady={onAgentCatalogReady}
          />
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
      <div className="mx-auto flex h-screen max-w-[1600px] flex-col px-4 py-4 md:px-6">
        <header className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} to="/projects">
              <ArrowLeft className="size-4" />
              Projects
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold tracking-tight">{project.name}</h1>
                <Badge variant={shouldUseDraftSession ? "secondary" : "outline"}>
                  {shouldUseDraftSession ? "Draft" : "Connected"}
                </Badge>
                <Badge variant="outline">{projectSessions.length} sessions</Badge>
              </div>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {project.workingDirectory} · {headerSubtitle}
              </p>
            </div>
          </div>
          <Link
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
            to="/settings"
          >
            <Settings className="size-4" />
            Settings
          </Link>
        </header>

        <section className="grid min-h-0 flex-1 gap-4 pt-4 md:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col rounded-lg border bg-background">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <p className="text-sm font-medium">Sessions</p>
              <div className="flex items-center gap-1">
                <Button
                  onClick={() => {
                    void refetchSessions();
                  }}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <RefreshCw className="size-4" />
                </Button>
                <Button
                  onClick={handleOpenLoadSessionDialog}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HistoryIcon className="size-4" />
                </Button>
                <Button onClick={handleStartDraftSession} size="icon" type="button">
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-2 p-3">
                {sessionEntries.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                    No sessions yet.
                  </div>
                ) : null}

                {sessionEntries.map((entry) => (
                  <SessionListItem
                    footerLeft={
                      entry.kind === "draft" ? "Draft" : formatDateTime(entry.session.createdAt)
                    }
                    key={entry.kind === "draft" ? "draft" : entry.session.sessionId}
                    listTitle={
                      entry.kind === "draft"
                        ? "New Session"
                        : resolveSessionListTitle(
                            entry.session,
                            firstUserTextInTranscript(entry.session.sessionId),
                          )
                    }
                    onSelect={() => {
                      if (entry.kind === "draft") {
                        handleStartDraftSession();
                        return;
                      }

                      handleSelectExistingSession(entry.session.sessionId);
                    }}
                    selected={
                      entry.kind === "draft"
                        ? shouldUseDraftSession
                        : entry.session.sessionId === selectedSession?.sessionId
                    }
                    session={entry}
                  />
                ))}
              </div>
            </ScrollArea>
          </aside>

          <div className="flex min-h-0 flex-col rounded-lg border bg-background">
            {shouldUseDraftSession || selectedSession === null ? null : (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                  {resolveSessionListTitle(
                    selectedSession,
                    firstUserTextInTranscript(selectedSession.sessionId),
                  )}
                </h2>
                <Button
                  aria-label="Close session"
                  className="shrink-0"
                  disabled={closeSessionMutation.isPending}
                  onClick={() => {
                    void handleCloseSession(selectedSession.sessionId);
                  }}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
            <ScrollArea className="min-h-0 flex-1 bg-[color-mix(in_oklab,var(--muted)_12%,var(--background))]">
              <div className="space-y-6 px-3 py-5 md:px-5">
                {transcript.length === 0 && !isAwaitingAssistantResponse ? (
                  <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-12 text-center">
                    <MessageSquareDashed className="mx-auto mb-3 size-8 text-muted-foreground/80" />
                    <p className="text-sm font-medium text-foreground/90">No messages</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      下の欄に入力して会話を始められます
                    </p>
                  </div>
                ) : null}
                {transcript.length > 0 &&
                visibleTranscript.length === 0 &&
                !isAwaitingAssistantResponse ? (
                  <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border/50 bg-card/20 px-6 py-8 text-center text-sm text-muted-foreground">
                    表示できるメッセージがありません（内部メタのみの可能性）
                  </div>
                ) : null}

                {visibleTranscript.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div
                      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
                      key={message.id}
                    >
                      <div
                        className={cn(
                          "flex min-w-0 flex-col gap-1",
                          CONVERSATION_COLUMN_CLASS,
                          isUser ? "items-stretch" : "items-stretch",
                        )}
                      >
                        <time
                          className={cn(
                            "select-none text-xs tabular-nums text-muted-foreground",
                            isUser ? "w-full pr-0.5 text-right" : "w-full pl-0.5 text-left",
                          )}
                          dateTime={message.createdAt}
                        >
                          {formatDateTime(message.createdAt)}
                        </time>
                        {isUser ? (
                          <div className="w-full rounded-2xl border border-border/60 bg-slate-50 px-3 py-3 text-foreground shadow-sm dark:bg-slate-900/50">
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

                {isAwaitingAssistantResponse ? (
                  <div
                    className={cn(
                      "flex w-full min-w-0 flex-col",
                      CONVERSATION_COLUMN_CLASS,
                      "pl-0.5",
                    )}
                    role="status"
                  >
                    <div className="flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-border/50 bg-card/50 px-4 py-3 text-sm text-muted-foreground shadow-sm">
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
              </div>
            </ScrollArea>

            <div className="border-t bg-background p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {attachedFiles.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No attached files</span>
                ) : (
                  attachedFiles.map((attachment) => (
                    <Badge key={attachment.attachmentId} variant="outline">
                      <Paperclip className="size-3" />
                      {attachment.name}
                    </Badge>
                  ))
                )}
              </div>

              <Textarea
                className="min-h-28 resize-none"
                onChange={(event) => {
                  setPrompt(event.target.value);
                }}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    if (canSend) {
                      void handleSendPrompt();
                    }
                  }
                }}
                placeholder={shouldUseDraftSession ? "Start a new session..." : "Reply..."}
                value={prompt}
              />

              <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  {shouldUseDraftSession ? (
                    <>
                      <div className="min-w-44 flex-1 sm:flex-none">
                        <Select
                          onValueChange={(value) => {
                            if (value !== null) {
                              setDraftPresetId(value);
                            }
                          }}
                          value={activePresetId}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Provider" />
                          </SelectTrigger>
                          <SelectContent>
                            {appInfoData.agentPresets.map((preset) => (
                              <SelectItem key={preset.id} value={preset.id}>
                                {preset.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-w-44 flex-1 sm:flex-none">
                        <Select
                          onValueChange={(value) => {
                            if (!draftModelSourceHasList || value === DRAFT_FALLBACK_SELECT_VALUE) {
                              return;
                            }
                            setDraftModelId(value);
                          }}
                          value={
                            draftModelSourceHasList
                              ? (draftModelId ??
                                draftModelModeListSource.currentModelId ??
                                draftModelModeListSource.availableModels[0]?.id ??
                                DRAFT_FALLBACK_SELECT_VALUE)
                              : DRAFT_FALLBACK_SELECT_VALUE
                          }
                        >
                          <SelectTrigger
                            className="w-full"
                            disabled={!draftModelSourceHasList}
                            title={
                              !draftModelSourceHasList
                                ? "エージェントに問い合わせて一覧を取得中か、利用可能なモデルがありません"
                                : undefined
                            }
                          >
                            <SelectValue placeholder="Model" />
                          </SelectTrigger>
                          <SelectContent>
                            {draftModelSourceHasList ? (
                              draftModelModeListSource.availableModels.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.name}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value={DRAFT_FALLBACK_SELECT_VALUE}>
                                既定（エージェント既定・一覧取得待ち）
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-w-44 flex-1 sm:flex-none">
                        <Select
                          onValueChange={(value) => {
                            if (!draftModeSourceHasList || value === DRAFT_FALLBACK_SELECT_VALUE) {
                              return;
                            }
                            setDraftModeId(value);
                          }}
                          value={
                            draftModeSourceHasList
                              ? (draftModeId ??
                                draftModelModeListSource.currentModeId ??
                                draftModelModeListSource.availableModes[0]?.id ??
                                DRAFT_FALLBACK_SELECT_VALUE)
                              : DRAFT_FALLBACK_SELECT_VALUE
                          }
                        >
                          <SelectTrigger
                            className="w-full"
                            disabled={!draftModeSourceHasList}
                            title={
                              !draftModeSourceHasList
                                ? "エージェントに問い合わせて一覧を取得中か、利用可能なモードがありません"
                                : undefined
                            }
                          >
                            <SelectValue placeholder="Effort" />
                          </SelectTrigger>
                          <SelectContent>
                            {draftModeSourceHasList ? (
                              draftModelModeListSource.availableModes.map((mode) => (
                                <SelectItem key={mode.id} value={mode.id}>
                                  {mode.name}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value={DRAFT_FALLBACK_SELECT_VALUE}>
                                既定（エージェント既定・一覧取得待ち）
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="min-w-44 flex-1 sm:flex-none">
                        <Select
                          onValueChange={(value) => {
                            if (value !== null) {
                              void handleUpdateSession({ modelId: value });
                            }
                          }}
                          value={
                            selectedSession.isActive
                              ? (selectedSession.currentModelId ?? undefined)
                              : (pendingTuningModelId ??
                                selectedSession.currentModelId ??
                                undefined)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Model" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedSession.availableModels.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="min-w-44 flex-1 sm:flex-none">
                        <Select
                          onValueChange={(value) => {
                            if (value !== null) {
                              void handleUpdateSession({ modeId: value });
                            }
                          }}
                          value={
                            selectedSession.isActive
                              ? (selectedSession.currentModeId ?? undefined)
                              : (pendingTuningModeId ?? selectedSession.currentModeId ?? undefined)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Effort" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedSession.availableModes.map((mode) => (
                              <SelectItem key={mode.id} value={mode.id}>
                                {mode.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  <Button
                    onClick={() => {
                      setIsAttachDialogOpen(true);
                    }}
                    type="button"
                    variant="outline"
                  >
                    <Paperclip className="size-4" />
                    Attach
                  </Button>
                </div>

                <Button
                  className="min-w-36"
                  disabled={!canSend}
                  onClick={() => {
                    void handleSendPrompt();
                  }}
                  type="button"
                >
                  <Send className="size-4" />
                  {isSending ? "Sending..." : shouldUseDraftSession ? "Start session" : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {isAttachDialogOpen ? (
        <AttachFilesDialog
          attachedFiles={attachedFiles}
          error={
            uploadAttachmentsMutation.error instanceof Error
              ? uploadAttachmentsMutation.error
              : null
          }
          isUploading={uploadAttachmentsMutation.isPending}
          onAttachFiles={handleAttachFiles}
          onClose={() => {
            setIsAttachDialogOpen(false);
          }}
          onRemoveFile={handleRemoveFile}
        />
      ) : null}

      {isLoadSessionDialogOpen ? (
        <LoadSessionDialog
          capability={discoverResumableSessionsMutation.data?.capability ?? null}
          error={
            discoverResumableSessionsMutation.error instanceof Error
              ? discoverResumableSessionsMutation.error
              : null
          }
          isLoading={discoverResumableSessionsMutation.isPending}
          isLoadingSession={loadSessionMutation.isPending}
          onClose={() => {
            setIsLoadSessionDialogOpen(false);
          }}
          onLoadSession={(session) => {
            void handleLoadExistingSession({
              sessionId: session.sessionId,
              title: session.title ?? null,
              updatedAt: session.updatedAt ?? null,
            });
          }}
          sessions={discoverResumableSessionsMutation.data?.sessions ?? []}
        />
      ) : null}
    </div>
  );
};
