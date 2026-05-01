import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { History, Loader2, Save, Settings } from 'lucide-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button, buttonVariants } from '../../../components/ui/button.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import { Textarea } from '../../../components/ui/textarea.tsx';
import {
  fetchAgentProviders,
  fetchProject,
  fetchProjectSettings,
  fetchSessions,
  updateProjectSettingsRequest,
} from '../../../lib/api/acp.ts';
import { SettingsPage } from '../../settings/settings-page.tsx';
import { ProjectMenuContent } from './project-menu-content.tsx';
import {
  agentProvidersQueryKey,
  projectQueryKey,
  projectsQueryKey,
  projectSettingsQueryKey,
  sessionsQueryKey,
} from './queries.ts';
import { useLoadSessionDialog } from './use-load-session-dialog.tsx';

export const ProjectSettingsPage: FC<{ readonly projectId: string }> = ({ projectId }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: projectData } = useSuspenseQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
  });
  const { data: settingsData } = useSuspenseQuery({
    queryKey: projectSettingsQueryKey(projectId),
    queryFn: () => fetchProjectSettings(projectId),
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
  const [projectName, setProjectName] = useState(projectData.project.name);
  const [worktreeSetupScript, setWorktreeSetupScript] = useState(
    settingsData.settings.worktreeSetupScript,
  );
  const updateSettingsMutation = useMutation({
    mutationFn: () =>
      updateProjectSettingsRequest(projectId, {
        name: projectName,
        worktreeSetupScript,
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(projectSettingsQueryKey(projectId), response);
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      toast.success(t('projectSettings.saved'));
    },
  });
  const settingsChanged =
    projectName !== projectData.project.name ||
    worktreeSetupScript !== settingsData.settings.worktreeSetupScript;

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
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Settings className="size-4" />
            {t('projectSettings.title')}
          </div>
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 space-y-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">
                {projectData.project.name}
              </h1>
              <p className="truncate font-mono text-sm text-muted-foreground">
                {projectData.project.workingDirectory}
              </p>
            </div>
            <Link
              className={buttonVariants({ className: 'w-full md:w-auto', variant: 'outline' })}
              params={{ projectId }}
              to="/projects/$projectId/sessions"
            >
              <History className="size-4" />
              {t('sessions.title')}
            </Link>
          </div>
        </header>

        <main className="space-y-6">
          <section className="app-panel rounded-lg border p-5">
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                updateSettingsMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="project-name">{t('projectSettings.projectName')}</Label>
                <Input
                  disabled={updateSettingsMutation.isPending}
                  id="project-name"
                  onChange={(event) => {
                    setProjectName(event.currentTarget.value);
                  }}
                  value={projectName}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('projectSettings.workingDirectory')}</Label>
                <p className="break-all rounded-md border bg-muted/30 px-3 py-2 font-mono text-sm text-muted-foreground">
                  {projectData.project.workingDirectory}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-worktree-setup-script">
                  {t('projectSettings.worktreeSetupScript')}
                </Label>
                <Textarea
                  className="min-h-32 font-mono"
                  disabled={updateSettingsMutation.isPending}
                  id="project-worktree-setup-script"
                  onChange={(event) => {
                    setWorktreeSetupScript(event.currentTarget.value);
                  }}
                  placeholder={t('projectSettings.worktreeSetupPlaceholder')}
                  value={worktreeSetupScript}
                />
              </div>

              {updateSettingsMutation.error === null ? null : (
                <p className="text-sm text-destructive">
                  {updateSettingsMutation.error instanceof Error
                    ? updateSettingsMutation.error.message
                    : t('projectSettings.saveFailed')}
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  disabled={
                    !settingsChanged ||
                    projectName.trim().length === 0 ||
                    updateSettingsMutation.isPending
                  }
                  type="submit"
                >
                  {updateSettingsMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {t('common.save')}
                </Button>
              </div>
            </form>
          </section>

          <SettingsPage />
        </main>
      </div>
    </div>
  );
};
