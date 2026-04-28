import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { History, MessageSquareDashed, Search } from "lucide-react";
import { useMemo, useState, type FC } from "react";

import type { SessionSummary, SessionsResponse } from "../../../../shared/acp.ts";
import { Badge } from "../../../components/ui/badge.tsx";
import { Button } from "../../../components/ui/button.tsx";
import { Input } from "../../../components/ui/input.tsx";
import {
  fetchProject,
  fetchResumableSessions,
  fetchSessions,
  loadSessionRequest,
} from "../../../lib/api/acp.ts";
import { resolveSessionListTitle } from "./chat-state.pure.ts";
import { LoadSessionDialog } from "./load-session-dialog.tsx";
import { filterSessionsByQuery, sortSessionsNewestFirst } from "./project-session-list.pure.ts";
import { ProjectMenuContent } from "./project-menu-content.tsx";
import { projectQueryKey, sessionsQueryKey } from "./queries.ts";

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
  const updatedAt = session.updatedAt ?? session.createdAt;

  return (
    <Link
      className="flex items-start gap-3 rounded-lg border bg-background/70 px-4 py-3 transition-colors hover:border-foreground/15 hover:bg-background"
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
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <p>{formatDateTime(updatedAt)}</p>
        <p>{session.isActive ? "active" : session.origin}</p>
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
  const { data: sessionsData } = useSuspenseQuery({
    queryKey: sessionsQueryKey,
    queryFn: fetchSessions,
  });
  const [query, setQuery] = useState("");
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
    setIsLoadSessionDialogOpen(true);
    discoverResumableSessionsMutation.mutate({
      projectId,
      presetId: "codex",
      cwd: projectData.project.workingDirectory,
    });
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
      cwd: projectData.project.workingDirectory,
      title,
      updatedAt,
    });

    upsertSessionInCache({
      ...response.session,
      sessionId: targetSessionId,
    });
    setIsLoadSessionDialogOpen(false);
    void navigate({
      to: "/projects/$projectId",
      params: { projectId },
      search: { "session-id": targetSessionId },
      replace: true,
    });
    void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
  };

  return (
    <div className="min-h-full bg-background">
      <ProjectMenuContent
        projectId={projectId}
        sessionCount={projectSessions.length}
        sessions={projectSessions}
      />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-4 border-b pb-5">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                セッションリスト
              </h1>
              <Badge variant="outline">{projectSessions.length} sessions</Badge>
            </div>
            <div className="relative w-full md:w-80">
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
            <Button
              className="w-full md:w-auto"
              onClick={handleOpenLoadSessionDialog}
              type="button"
              variant="outline"
            >
              <History className="size-4" />
              既存セッションを読み込む
            </Button>
          </div>
        </header>

        <main className="space-y-3">
          {sessions.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-background/60 px-6 py-14 text-center">
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
