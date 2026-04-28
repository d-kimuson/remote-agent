import { useSuspenseQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Bell, Menu } from "lucide-react";
import type { FC } from "react";

import { Button } from "@/web/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/web/components/ui/select";
import { fetchProjects } from "@/web/lib/api/acp";

const projectsQueryKey = ["projects"] as const;

const currentProjectIdFromPath = (pathname: string): string | null => {
  const match = /^\/projects\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
};

const compactPath = (path: string): string => {
  const home = "/home/kaito";
  const withHome = path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path;
  const parts = withHome.split("/").filter((part) => part.length > 0);
  const prefix = withHome.startsWith("~/") ? "~" : withHome.startsWith("/") ? "" : null;

  if (parts.length <= 3) {
    return withHome;
  }

  const tail = parts.slice(-2).join("/");
  return prefix === null ? `../${tail}` : `${prefix}/../${tail}`;
};

export const AppHeader: FC<{ readonly onOpenMenu: () => void }> = ({ onOpenMenu }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentProjectId = currentProjectIdFromPath(location.pathname);
  const { data } = useSuspenseQuery({
    queryKey: projectsQueryKey,
    queryFn: fetchProjects,
  });
  const projects = data.projects;
  const projectPathSuffix = location.pathname.endsWith("/sessions") ? "sessions" : "chat";

  return (
    <header className="sticky top-0 z-30 flex h-10 shrink-0 items-center gap-2 border-b border-border/50 bg-background/90 px-3 backdrop-blur supports-backdrop-filter:bg-background/75">
      <Button
        aria-label="Open menu"
        className="shrink-0"
        onClick={onOpenMenu}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Menu className="size-4" />
      </Button>
      {currentProjectId === null ? (
        <div className="flex min-w-0 flex-1 items-center">
          <p className="truncate text-sm font-semibold tracking-tight">acp-playground</p>
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
                    projectPathSuffix === "sessions"
                      ? "/projects/$projectId/sessions"
                      : "/projects/$projectId",
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
          <button
            aria-label="Notifications"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            type="button"
          >
            <Bell className="size-4" />
          </button>
        </>
      )}
    </header>
  );
};
