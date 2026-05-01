import type { FC } from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { fetchAgentProviders, fetchProject, fetchSessions } from '../../../lib/api/acp.ts';
import { RoutineSettingsPanel } from '../../settings/settings-panels.tsx';
import { ProjectMenuContent } from './project-menu-content.tsx';
import { agentProvidersQueryKey, projectQueryKey, sessionsQueryKey } from './queries.ts';
import { useLoadSessionDialog } from './use-load-session-dialog.tsx';

export const ProjectRoutinesPage: FC<{ readonly projectId: string }> = ({ projectId }) => {
  const { t } = useTranslation();
  const { data: projectData } = useSuspenseQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
  });
  const { data: sessionsData } = useSuspenseQuery({
    queryKey: sessionsQueryKey,
    queryFn: fetchSessions,
  });
  const { data: providerData } = useSuspenseQuery({
    queryKey: agentProvidersQueryKey,
    queryFn: fetchAgentProviders,
  });
  const projectSessions = sessionsData.sessions.filter(
    (session) => session.projectId === projectId,
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
      {dialog}
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-3 border-b pb-5">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t('routines.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('routines.description', { projectName: projectData.project.name })}
          </p>
        </header>
        <RoutineSettingsPanel project={projectData.project} />
      </div>
    </div>
  );
};
