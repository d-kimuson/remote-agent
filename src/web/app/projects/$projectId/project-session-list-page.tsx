import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { History, MessageSquareDashed, Plus, Search } from 'lucide-react';
import { useMemo, useState, type FC } from 'react';

import type { SessionSummary } from '../../../../shared/acp.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button, buttonVariants } from '../../../components/ui/button.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { fetchAgentProviders, fetchProject, fetchSessions } from '../../../lib/api/acp.ts';
import { cn } from '../../../lib/utils.ts';
import { resolveSessionListTitle } from './chat-state.pure.ts';
import { ProjectMenuContent } from './project-menu-content.tsx';
import {
  filterSessionsByQuery,
  sessionStatusBadgeClassName,
  sessionStatusLabel,
  sessionStatusRowClassName,
  sessionTimestamp,
  sortSessionsNewestFirst,
} from './project-session-list.pure.ts';
import { agentProvidersQueryKey, projectQueryKey, sessionsQueryKey } from './queries.ts';
import { useLoadSessionDialog } from './use-load-session-dialog.tsx';

const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
        'app-card-hover flex items-start gap-3 rounded-lg border bg-card/80 px-4 py-3 transition-colors hover:border-foreground/15',
        sessionStatusRowClassName(session.status),
      )}
      params={{ projectId }}
      search={{ 'session-id': session.sessionId }}
      to="/projects/$projectId"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
          <Badge variant="outline">{session.presetId ?? 'custom'}</Badge>
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
  const [query, setQuery] = useState('');
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
  const { canLoadSessions, dialog, openLoadSessionDialog } = useLoadSessionDialog({
    projectId,
    providers: providerData.providers,
    workingDirectory: projectData.project.workingDirectory,
  });

  return (
    <div className="app-page">
      <ProjectMenuContent
        canLoadSessions={canLoadSessions}
        currentSessionId={null}
        onOpenLoadSessions={openLoadSessionDialog}
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
              <Button
                className="w-full sm:w-auto"
                disabled={!canLoadSessions}
                onClick={openLoadSessionDialog}
                type="button"
                variant="outline"
              >
                <History className="size-4" />
                既存セッションを読み込む
              </Button>
              <Link
                aria-label="新規セッション"
                className={buttonVariants({ className: 'w-full sm:w-auto', variant: 'default' })}
                params={{ projectId }}
                search={{}}
                to="/projects/$projectId"
              >
                <Plus className="size-4" />
                新規セッション
              </Link>
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

      {dialog}
    </div>
  );
};
