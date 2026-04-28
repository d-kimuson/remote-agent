import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { History, MessageSquareDashed, Plus, Search } from "lucide-react";
import { useMemo, useState, type FC } from "react";

import type { SessionSummary, SessionsResponse } from "../../../../shared/acp.ts";
import { Badge } from "../../../components/ui/badge.tsx";
import { Button, buttonVariants } from "../../../components/ui/button.tsx";
import { Input } from "../../../components/ui/input.tsx";
import {
  fetchAgentProviders,
  fetchProject,
  fetchResumableSessions,
  fetchSessions,
  loadSessionRequest,
} from "../../../lib/api/acp.ts";
import { cn } from "../../../lib/utils.ts";
import { resolveSessionListTitle } from "./chat-state.pure.ts";
import { LoadSessionDialog } from "./load-session-dialog.tsx";
import {
  filterSessionsByQuery,
  sessionStatusBadgeClassName,
  sessionStatusLabel,
  sessionStatusRowClassName,
  sessionTimestamp,
  sortSessionsNewestFirst,
} from "./project-session-list.pure.ts";
import { ProjectMenuContent } from "./project-menu-content.tsx";
import { agentProvidersQueryKey, projectQueryKey, sessionsQueryKey } from "./queries.ts";

const loadableProviderIds = new Set(["codex", "claude-code", "pi-coding-agent"]);

const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const SessionRow: FC<{ readonly projectId: string; readonly session: SessionSummary }> = ({
  projectId,
  session,
}) => {
  const title = resolveSessionListTitle(session, null, { maxChars: 120 });
  const timestamp = sessionTimestamp(session);

  return (
    <Link
      className={cn(
        "app-card-hover flex items-start gap-3 rounded-lg border border-l-4 bg-card/80 px-4 py-3 transition-colors hover:border-foreground/15",
        sessionStatusRowClassName(session.status),
      )}
      params={{ projectId }}
      search={{ "session-id": session.sessionId }}
      to="/projects/$projectId"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
          <Badge variant="outline">{session.presetId ?? "custom"}</Badge>
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{session.cwd}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right text-xs text-muted-foreground">
        <time dateTime={timestamp}>{formatDateTime(timestamp)}</time>
        <Badge className={sessionStatusBadgeClassName(session.status)} variant="outline">
          {sessionStatusLabel(session.status)}
        </Badge>
      </div>
    </Link>
  );
};

export const ProjectSessionListPage: FC<{ readonly projectId: string }> = ({ projectId }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/projects/$projectId/sessions" });
  const { data: projectData } = useSuspenseQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
  });
  const { data: providerData } = useSuspenseQuery({
    queryKey: agentProvidersQueryKey,
    queryFn: fetchAgentProviders,
  });
  const { data: sessionsData } = useSuspenseQuery({
    queryKey: sessionsQueryKey,
    queryFn: fetchSessions,
  });
  const [query, setQuery] = useState("");
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const selectablePresets = useMemo(
    () =>
      providerData.providers
        .filter((entry) => entry.enabled && loadableProviderIds.has(entry.preset.id))
        .map((entry) => entry.preset),
    [providerData.providers],
  );
  const [loadPresetId, setLoadPresetId] = useState<string | null>(null);
  const [isLoadSessionDialogOpen, setIsLoadSessionDialogOpen] = useState(false);
  const projectSessions = useMemo(
    () => sessionsData.sessions.filter((session) => session.projectId === projectId),
    [projectId, sessionsData.sessions],
  );
  const sessions = useMemo(
    () =>
      filterSessionsByQuery({
        query,
        sessions: sortSessionsNewestFirst(projectSessions),
      }),
    [projectSessions, query],
  );

  const loadSessionMutation = useMutation({
    mutationFn: loadSessionRequest,
  });
  const discoverResumableSessionsMutation = useMutation({
    mutationFn: fetchResumableSessions,
  });

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
    setSessionsData((currentSessions) =>
      currentSessions.some((entry) => entry.sessionId === session.sessionId)
        ? currentSessions.map((entry) => (entry.sessionId === session.sessionId ? session : entry))
        : [session, ...currentSessions],
    );
  };

  const handleOpenLoadSessionDialog = () => {
    setLoadPresetId(null);
    discoverResumableSessionsMutation.reset();
    setIsLoadSessionDialogOpen(true);
  };

  const handleSelectLoadProvider = (presetId: string) => {
    setLoadPresetId(presetId);
    discoverResumableSessionsMutation.reset();
    discoverResumableSessionsMutation.mutate({
      projectId,
      presetId,
      cwd: projectData.project.workingDirectory,
    });
  };

  const handleLoadExistingSessions = async (
    selectedSessions: readonly {
      readonly sessionId: string;
      readonly title: string | null | undefined;
      readonly updatedAt: string | null | undefined;
    }[],
  ) => {
    if (loadPresetId === null || selectedSessions.length === 0) {
      return;
    }

    setIsLoadingSessions(true);
    try {
      for (const session of selectedSessions) {
        const response = await loadSessionMutation.mutateAsync({
          projectId,
          presetId: loadPresetId,
          sessionId: session.sessionId,
          cwd: projectData.project.workingDirectory,
          title: session.title ?? null,
          updatedAt: session.updatedAt ?? null,
        });

        upsertSessionInCache({
          ...response.session,
          sessionId: session.sessionId,
        });
      }

      const firstSession = selectedSessions[0];
      setIsLoadSessionDialogOpen(false);
      if (firstSession !== undefined) {
        void navigate({
          to: "/projects/$projectId",
          params: { projectId },
          search: { "session-id": firstSession.sessionId },
          replace: true,
        });
      }
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    } finally {
      setIsLoadingSessions(false);
    }
  };

  return (
    <div className="app-page">
      <ProjectMenuContent
        currentSessionId={null}
        projectId={projectId}
        sessionCount={projectSessions.length}
        sessions={projectSessions}
      />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-4 border-b pb-5">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">セッションリスト</h1>
            <Badge variant="outline">{projectSessions.length} sessions</Badge>
          </div>
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                placeholder="セッションを検索"
                value={query}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              <Link
                aria-label="新規セッション"
                className={buttonVariants({ className: "w-full sm:w-auto", variant: "default" })}
                params={{ projectId }}
                search={{}}
                to="/projects/$projectId"
              >
                <Plus className="size-4" />
                新規セッション
              </Link>
              <Button
                className="w-full sm:w-72 sm:min-w-72"
                disabled={selectablePresets.length === 0}
                onClick={handleOpenLoadSessionDialog}
                type="button"
                variant="outline"
              >
                <History className="size-4" />
                既存セッションを読み込む
              </Button>
            </div>
          </div>
        </header>

        <main className="space-y-3">
          {sessions.length === 0 ? (
            <div className="app-panel rounded-lg border-dashed px-6 py-14 text-center">
              <MessageSquareDashed className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="text-sm font-medium">No sessions found.</p>
            </div>
          ) : null}
          {sessions.map((session) => (
            <SessionRow key={session.sessionId} projectId={projectId} session={session} />
          ))}
        </main>
      </div>

      {isLoadSessionDialogOpen ? (
        <LoadSessionDialog
          capability={
            loadPresetId === null
              ? null
              : (discoverResumableSessionsMutation.data?.capability ?? null)
          }
          error={
            discoverResumableSessionsMutation.error instanceof Error
              ? discoverResumableSessionsMutation.error
              : null
          }
          isLoading={discoverResumableSessionsMutation.isPending}
          isLoadingSession={loadSessionMutation.isPending || isLoadingSessions}
          onClose={() => {
            setIsLoadSessionDialogOpen(false);
            setLoadPresetId(null);
            discoverResumableSessionsMutation.reset();
          }}
          onLoadSessions={(sessions) => {
            void handleLoadExistingSessions(sessions);
          }}
          onSelectProvider={handleSelectLoadProvider}
          providerPresets={selectablePresets}
          selectedProviderId={loadPresetId}
          sessions={
            loadPresetId === null ? [] : (discoverResumableSessionsMutation.data?.sessions ?? [])
          }
        />
      ) : null}
    </div>
  );
};
