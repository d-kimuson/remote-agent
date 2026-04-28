import { Suspense, type FC } from "react";

import { ProjectList, ProjectListSkeleton } from "./project-list.tsx";
import { SetupProjectDialog } from "./setup-project-dialog.tsx";

export const ProjectListPage: FC = () => {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <header className="mb-8 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
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
