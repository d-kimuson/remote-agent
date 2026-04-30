import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Folder, History, Loader2, Save, Settings } from 'lucide-react';
import { useState, type FC } from 'react';
import { toast } from 'sonner';

import { Badge } from '../../../components/ui/badge.tsx';
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
import { ProjectMenuContent } from './project-menu-content.tsx';
import {
  agentProvidersQueryKey,
  projectQueryKey,
  projectSettingsQueryKey,
  sessionsQueryKey,
} from './queries.ts';
import { useLoadSessionDialog } from './use-load-session-dialog.tsx';

export const ProjectSettingsPage: FC<{ readonly projectId: string }> = ({ projectId }) => {
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
  const [worktreeSetupScript, setWorktreeSetupScript] = useState(
    settingsData.settings.worktreeSetupScript,
  );
  const updateSettingsMutation = useMutation({
    mutationFn: () =>
      updateProjectSettingsRequest(projectId, {
        worktreeSetupScript,
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(projectSettingsQueryKey(projectId), response);
      toast.success('Project settings saved');
    },
  });
  const settingsChanged = worktreeSetupScript !== settingsData.settings.worktreeSetupScript;

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

      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-3 border-b pb-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Settings className="size-4" />
            Project settings
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
              セッションリスト
            </Link>
          </div>
        </header>

        <main className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <section className="app-panel rounded-lg border p-5">
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                updateSettingsMutation.mutate();
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project name</Label>
                  <Input id="project-name" readOnly value={projectData.project.name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-id">Project ID</Label>
                  <Input className="font-mono" id="project-id" readOnly value={projectId} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-working-directory">Working directory</Label>
                <Input
                  className="font-mono"
                  id="project-working-directory"
                  readOnly
                  value={projectData.project.workingDirectory}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-worktree-setup-script">Worktree setup script</Label>
                <Textarea
                  className="min-h-32 font-mono"
                  disabled={updateSettingsMutation.isPending}
                  id="project-worktree-setup-script"
                  onChange={(event) => {
                    setWorktreeSetupScript(event.currentTarget.value);
                  }}
                  placeholder="pnpm install"
                  value={worktreeSetupScript}
                />
              </div>

              {updateSettingsMutation.error === null ? null : (
                <p className="text-sm text-destructive">
                  {updateSettingsMutation.error instanceof Error
                    ? updateSettingsMutation.error.message
                    : 'Failed to save project settings'}
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  disabled={!settingsChanged || updateSettingsMutation.isPending}
                  type="submit"
                >
                  {updateSettingsMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  保存
                </Button>
              </div>
            </form>
          </section>

          <aside className="app-panel flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Folder className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Project</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{projectSessions.length} sessions</Badge>
              <Badge variant="outline">
                {settingsData.settings.modelPreferences.length} models
              </Badge>
              <Badge variant="outline">{settingsData.settings.modePreferences.length} modes</Badge>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};
