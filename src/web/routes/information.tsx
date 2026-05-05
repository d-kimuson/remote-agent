import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CheckCircle2, Info, Server } from 'lucide-react';
import { Suspense, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { ProjectMenuContent } from '../app/projects/$projectId/project-menu-content.tsx';
import {
  agentProvidersQueryKey,
  appInfoQueryKey,
  projectQueryKey,
  sessionsQueryKey,
} from '../app/projects/$projectId/queries.ts';
import { useLoadSessionDialog } from '../app/projects/$projectId/use-load-session-dialog.tsx';
import { fetchAgentProviders, fetchAppInfo, fetchProject, fetchSessions } from '../lib/api/acp.ts';

type InformationSearch = {
  readonly projectId?: string;
};

const ProjectInformationMenu: FC<{ readonly projectId: string }> = ({ projectId }) => {
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
    <>
      <ProjectMenuContent
        canLoadSessions={canLoadSessions}
        currentSessionId={null}
        onOpenLoadSessions={openLoadSessionDialog}
        projectId={projectId}
        sessionCount={projectSessions.length}
        sessions={projectSessions}
      />
      {dialog}
    </>
  );
};

const InformationRoute: FC = () => {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const { data: appInfo } = useSuspenseQuery({
    queryKey: appInfoQueryKey,
    queryFn: fetchAppInfo,
  });

  return (
    <div className="app-page">
      {search.projectId === undefined ? null : (
        <Suspense>
          <ProjectInformationMenu projectId={search.projectId} />
        </Suspense>
      )}
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-3 border-b pb-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="size-4" />
            {t('information.title')}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{appInfo.appName}</h1>
        </header>

        <main className="space-y-6">
          <section className="app-panel rounded-lg border p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 text-emerald-500" />
              <div className="space-y-1">
                <h2 className="font-medium">{t('information.connectionStatus')}</h2>
                <p className="text-sm text-muted-foreground">{t('information.apiReachable')}</p>
              </div>
            </div>
          </section>

          <section className="app-panel rounded-lg border p-5">
            <div className="mb-4 flex items-center gap-2">
              <Server className="size-4 text-muted-foreground" />
              <h2 className="font-medium">{t('information.remoteAgent')}</h2>
            </div>
            <dl className="grid gap-3 text-sm md:grid-cols-[160px_minmax(0,1fr)]">
              <dt className="text-muted-foreground">{t('information.version')}</dt>
              <dd className="font-mono">{appInfo.version}</dd>
              <dt className="text-muted-foreground">{t('information.workingDirectory')}</dt>
              <dd className="break-all font-mono">{appInfo.workingDirectory}</dd>
              <dt className="text-muted-foreground">{t('information.projectsFilePath')}</dt>
              <dd className="break-all font-mono">{appInfo.projectsFilePath}</dd>
              <dt className="text-muted-foreground">{t('information.agentPresets')}</dt>
              <dd>{appInfo.agentPresets.length}</dd>
            </dl>
          </section>
        </main>
      </div>
    </div>
  );
};

export const Route = createFileRoute('/information')({
  component: InformationRoute,
  validateSearch: (search: Record<string, unknown>): InformationSearch => {
    const projectId = search['projectId'];
    return {
      projectId: typeof projectId === 'string' && projectId.length > 0 ? projectId : undefined,
    };
  },
});
