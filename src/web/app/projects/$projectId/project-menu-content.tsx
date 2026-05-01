import type { FC } from 'react';

import { Link } from '@tanstack/react-router';
import { CalendarClock, FolderKanban, History, MessageSquare, Plus, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { SessionSummary } from '../../../../shared/acp.ts';

import { AppMenuPortal, useCloseAppMenu } from '../../../components/app-menu.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { ScrollArea } from '../../../components/ui/scroll-area.tsx';
import { cn } from '../../../lib/utils.ts';
import { resolveSessionListTitle } from './chat-state.pure.ts';
import {
  sessionStatusBadgeClassName,
  sessionStatusLabel,
  sessionStatusRowClassName,
  sessionTimestamp,
  sortSessionsNewestFirst,
} from './project-session-list.pure.ts';

const menuLinkClassName =
  'flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

export const ProjectMenuContent: FC<{
  readonly canLoadSessions: boolean;
  readonly projectId: string;
  readonly currentSessionId: string | null;
  readonly onOpenLoadSessions: () => void;
  readonly sessions: readonly SessionSummary[];
  readonly sessionCount: number;
}> = ({
  canLoadSessions,
  currentSessionId,
  onOpenLoadSessions,
  projectId,
  sessions,
  sessionCount,
}) => {
  const { t } = useTranslation();
  const closeAppMenu = useCloseAppMenu();
  const sortedSessions = sortSessionsNewestFirst(sessions);

  return (
    <AppMenuPortal>
      <div className="flex h-full min-h-0 flex-col gap-4 p-3">
        <div className="space-y-1">
          <Link
            className={cn(menuLinkClassName, 'justify-between')}
            onClick={closeAppMenu}
            params={{ projectId }}
            to="/projects/$projectId/sessions"
          >
            <span className="flex min-w-0 items-center gap-2">
              <MessageSquare className="size-4 shrink-0" />
              <span className="truncate">{t('menu.sessions')}</span>
            </span>
            <Badge variant="secondary">{sessionCount}</Badge>
          </Link>
          <Link
            className={menuLinkClassName}
            onClick={closeAppMenu}
            params={{ projectId }}
            to="/projects/$projectId/routines"
          >
            <CalendarClock className="size-4" />
            {t('menu.routines')}
          </Link>
          <Link
            className={menuLinkClassName}
            onClick={closeAppMenu}
            params={{ projectId }}
            to="/projects/$projectId/settings"
          >
            <Settings className="size-4" />
            {t('menu.settings')}
          </Link>
          <Link className={menuLinkClassName} onClick={closeAppMenu} to="/projects">
            <FolderKanban className="size-4" />
            {t('menu.projects')}
          </Link>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-sidebar-border pt-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground">
              {t('menu.recentSessions')}
            </p>
            <div className="flex items-center gap-1">
              <Button
                aria-label={t('sessions.loadExisting')}
                disabled={!canLoadSessions}
                onClick={() => {
                  closeAppMenu();
                  onOpenLoadSessions();
                }}
                size="icon-sm"
                title={t('sessions.loadExisting')}
                type="button"
                variant="ghost"
              >
                <History className="size-4" />
              </Button>
              <Link
                aria-label={t('sessions.newSession')}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={closeAppMenu}
                params={{ projectId }}
                search={{}}
                title={t('sessions.newSession')}
                to="/projects/$projectId"
              >
                <Plus className="size-4" />
              </Link>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 pr-2">
              {sortedSessions.length === 0 ? (
                <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  {t('menu.noSessionsYet')}
                </div>
              ) : null}
              {sortedSessions.map((session) => {
                const timestamp = sessionTimestamp(session);
                const isCurrentSession = session.sessionId === currentSessionId;
                return (
                  <Link
                    aria-current={isCurrentSession ? 'page' : undefined}
                    className={cn(
                      'block relative overflow-hidden rounded-lg border border-sidebar-border bg-sidebar-accent/35 px-3 py-2 transition-colors hover:border-sidebar-foreground/20 hover:bg-sidebar-accent/70',
                      sessionStatusRowClassName(session.status),
                      isCurrentSession
                        ? 'border-sidebar-primary/50 bg-sidebar-primary/22 shadow-sm hover:border-sidebar-primary hover:bg-sidebar-primary/28'
                        : '',
                    )}
                    key={session.sessionId}
                    onClick={closeAppMenu}
                    params={{ projectId }}
                    search={{ 'session-id': session.sessionId }}
                    to="/projects/$projectId"
                  >
                    {isCurrentSession ? (
                      <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-sidebar-primary" />
                    ) : null}
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">
                        {resolveSessionListTitle(session, null, { maxChars: 72 })}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        {isCurrentSession ? (
                          <Badge className="border-sidebar-primary/40 bg-sidebar-primary/15 text-sidebar-primary">
                            {t('menu.viewing')}
                          </Badge>
                        ) : null}
                        <Badge className="shrink-0" variant="outline">
                          {session.presetId ?? 'custom'}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {session.cwd}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <time
                        className="text-[11px] tabular-nums text-muted-foreground"
                        dateTime={timestamp}
                      >
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
          </ScrollArea>
        </div>
      </div>
    </AppMenuPortal>
  );
};
