import type { FC } from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import { fetchProject, fetchSessions } from '../../../lib/api/acp.ts';
import { RoutineSettingsPanel } from '../../settings/settings-panels.tsx';
import { ProjectMenuContent } from './project-menu-content.tsx';
import { projectQueryKey, sessionsQueryKey } from './queries.ts';

export const ProjectRoutinesPage: FC<{ readonly projectId: string }> = ({ projectId }) => {
  const { data: projectData } = useSuspenseQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
  });
  const { data: sessionsData } = useSuspenseQuery({
    queryKey: sessionsQueryKey,
    queryFn: fetchSessions,
  });
  const projectSessions = sessionsData.sessions.filter(
    (session) => session.projectId === projectId,
  );

  return (
    <div className="app-page">
      <ProjectMenuContent
        currentSessionId={null}
        projectId={projectId}
        sessionCount={projectSessions.length}
        sessions={projectSessions}
      />
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-3 border-b pb-5">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Routines</h1>
          <p className="text-sm text-muted-foreground">
            {projectData.project.name} で実行する定期タスクを管理します。
          </p>
        </header>
        <RoutineSettingsPanel project={projectData.project} />
      </div>
    </div>
  );
};
