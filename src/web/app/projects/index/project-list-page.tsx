import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, type FC } from "react";

import { Badge } from "../../../components/ui/badge.tsx";
import { fetchAppInfo } from "../../../lib/api/acp.ts";
import { ProjectList, ProjectListSkeleton } from "./project-list.tsx";
import { SetupProjectDialog } from "./setup-project-dialog.tsx";

const appInfoQueryKey = ["app-info"] as const;

export const ProjectListPage: FC = () => {
  const { data: appInfo } = useSuspenseQuery({
    queryKey: appInfoQueryKey,
    queryFn: fetchAppInfo,
  });

  return (
    <div className="flex h-screen max-h-screen flex-col overflow-hidden">
      <header className="flex h-12 flex-shrink-0 select-none items-center justify-between border-b border-border/40 bg-muted/30 px-4 text-xs">
        <span className="text-sm font-semibold text-foreground">{appInfo.appName}</span>
        <Badge variant="secondary">ACP Playground</Badge>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <header className="mb-8 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="break-all font-mono text-xs text-muted-foreground">
              {appInfo.workingDirectory}
            </p>
          </header>

          <main>
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Your projects</h2>
                <SetupProjectDialog />
              </div>
              <Suspense fallback={<ProjectListSkeleton />}>
                <ProjectList />
              </Suspense>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
};
