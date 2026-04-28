import { Link } from "@tanstack/react-router";
import { FolderKanban, MessageSquare, Settings } from "lucide-react";
import type { FC } from "react";

import type { SessionSummary } from "../../../../shared/acp.ts";
import { AppMenuPortal, useCloseAppMenu } from "../../../components/app-menu.tsx";
import { Badge } from "../../../components/ui/badge.tsx";
import { ScrollArea } from "../../../components/ui/scroll-area.tsx";
import { cn } from "../../../lib/utils.ts";
import { resolveSessionListTitle } from "./chat-state.pure.ts";
import { sortSessionsNewestFirst } from "./project-session-list.pure.ts";

const menuLinkClassName =
  "flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export const ProjectMenuContent: FC<{
  readonly projectId: string;
  readonly sessions: readonly SessionSummary[];
  readonly sessionCount: number;
}> = ({ projectId, sessions, sessionCount }) => {
  const closeAppMenu = useCloseAppMenu();
  const sortedSessions = sortSessionsNewestFirst(sessions);

  return (
    <AppMenuPortal>
      <div className="flex h-full min-h-0 flex-col gap-4 p-3">
        <div className="space-y-1">
          <Link
            className={cn(menuLinkClassName, "justify-between")}
            onClick={closeAppMenu}
            params={{ projectId }}
            to="/projects/$projectId/sessions"
          >
            <span className="flex min-w-0 items-center gap-2">
              <MessageSquare className="size-4 shrink-0" />
              <span className="truncate">セッションリスト</span>
            </span>
            <Badge variant="secondary">{sessionCount}</Badge>
          </Link>
          <Link className={menuLinkClassName} onClick={closeAppMenu} to="/projects">
            <FolderKanban className="size-4" />
            プロジェクト
          </Link>
          <Link className={menuLinkClassName} onClick={closeAppMenu} to="/settings">
            <Settings className="size-4" />
            設定
          </Link>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-sidebar-border pt-3">
          <p className="px-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground">
            RECENT SESSIONS
          </p>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 pr-2">
              {sortedSessions.length === 0 ? (
                <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  No sessions yet.
                </div>
              ) : null}
              {sortedSessions.map((session) => (
                <Link
                  className="block rounded-lg border border-sidebar-border bg-background/60 px-3 py-2 transition-colors hover:border-foreground/15 hover:bg-background"
                  key={session.sessionId}
                  onClick={closeAppMenu}
                  params={{ projectId }}
                  search={{ "session-id": session.sessionId }}
                  to="/projects/$projectId"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {resolveSessionListTitle(session, null, { maxChars: 72 })}
                    </p>
                    <Badge className="shrink-0" variant="outline">
                      {session.presetId ?? "custom"}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    {session.cwd}
                  </p>
                </Link>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </AppMenuPortal>
  );
};
