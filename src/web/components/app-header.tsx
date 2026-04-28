import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { Bell, CheckCheck, Menu } from 'lucide-react';
import { useState, type FC } from 'react';

import { projectsQueryKey } from '@/web/app/projects/$projectId/queries';
import { Button } from '@/web/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/web/components/ui/select';
import { fetchProjects } from '@/web/lib/api/acp';
import {
  markAllAppNotificationsRead,
  markAppNotificationRead,
  notificationDisplayLimit,
  useNotificationCenter,
} from '@/web/pwa/notification-center';

const currentProjectIdFromPath = (pathname: string): string | null => {
  const match = /^\/projects\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
};

const compactPath = (path: string): string => {
  const home = '/home/kaito';
  const withHome = path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path;
  const parts = withHome.split('/').filter((part) => part.length > 0);
  const prefix = withHome.startsWith('~/') ? '~' : withHome.startsWith('/') ? '' : null;

  if (parts.length <= 3) {
    return withHome;
  }

  const tail = parts.slice(-2).join('/');
  return prefix === null ? `../${tail}` : `${prefix}/../${tail}`;
};

const NotificationButton: FC = () => {
  const { notifications, unreadCount } = useNotificationCenter();
  const [isOpen, setIsOpen] = useState(false);
  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);
  const visibleNotifications = notifications.slice(0, notificationDisplayLimit);

  return (
    <div className="relative shrink-0">
      <Button
        aria-expanded={isOpen}
        aria-label={
          unreadCount > 0 ? `Notifications, ${String(unreadCount)} unread` : 'Notifications'
        }
        className="relative"
        onClick={() => {
          setIsOpen((current) => !current);
        }}
        size="icon-sm"
        title={unreadCount > 0 ? `${String(unreadCount)} unread notifications` : 'Notifications'}
        type="button"
        variant="ghost"
      >
        <Bell className="size-4" />
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-destructive-foreground">
            {displayCount}
          </span>
        ) : null}
      </Button>

      {isOpen ? (
        <div className="app-panel-strong absolute top-9 right-0 z-50 w-[min(360px,calc(100vw-1.5rem))] overflow-hidden rounded-lg text-popover-foreground">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-xs text-muted-foreground">
                {unreadCount} unread · latest {notificationDisplayLimit}
              </p>
            </div>
            <Button
              disabled={unreadCount === 0}
              onClick={markAllAppNotificationsRead}
              size="sm"
              type="button"
              variant="ghost"
            >
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {visibleNotifications.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
                No notifications.
              </div>
            ) : null}
            <div className="space-y-2">
              {visibleNotifications.map((notification) => {
                const isUnread = notification.readAt === null;
                return (
                  <Link
                    className="block"
                    key={notification.id}
                    onClick={() => {
                      markAppNotificationRead(notification.id);
                      setIsOpen(false);
                    }}
                    to={notification.url}
                  >
                    <article
                      className={[
                        'rounded-md border px-3 py-2.5 transition-colors hover:bg-muted/55',
                        isUnread
                          ? 'border-primary/30 bg-primary/[0.08]'
                          : 'border-border bg-background/70',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{notification.title}</p>
                        {isUnread ? (
                          <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {notification.body}
                      </p>
                      <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                        {notification.projectName}
                      </p>
                    </article>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const AppHeader: FC<{
  readonly isDesktopMenuExpanded: boolean;
  readonly onOpenMenu: () => void;
}> = ({ isDesktopMenuExpanded, onOpenMenu }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentProjectId = currentProjectIdFromPath(location.pathname);
  const { data } = useSuspenseQuery({
    queryKey: projectsQueryKey,
    queryFn: fetchProjects,
  });
  const projects = data.projects;
  const projectPathSuffix = location.pathname.endsWith('/sessions') ? 'sessions' : 'chat';

  return (
    <header className="app-topbar sticky top-0 z-30 flex h-10 shrink-0 items-center gap-2 border-b px-3 backdrop-blur">
      <Button
        aria-label="Open menu"
        className={isDesktopMenuExpanded ? 'shrink-0 md:hidden' : 'shrink-0'}
        onClick={onOpenMenu}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Menu className="size-4" />
      </Button>
      {currentProjectId === null ? (
        <div className="flex min-w-0 flex-1 items-center">
          <p className="truncate text-sm font-semibold tracking-tight">remote-agent</p>
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <Select
              onValueChange={(nextProjectId) => {
                if (nextProjectId === null || nextProjectId === currentProjectId) {
                  return;
                }
                void navigate({
                  to:
                    projectPathSuffix === 'sessions'
                      ? '/projects/$projectId/sessions'
                      : '/projects/$projectId',
                  params: { projectId: nextProjectId },
                });
              }}
              value={currentProjectId}
            >
              <SelectTrigger className="h-7 max-w-full border-transparent px-2 font-mono text-xs hover:bg-muted md:max-w-[560px]">
                <SelectValue placeholder={currentProjectId} />
              </SelectTrigger>
              <SelectContent align="start" className="min-w-72">
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <span className="font-mono text-xs">
                      {compactPath(project.workingDirectory)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      <NotificationButton />
    </header>
  );
};
