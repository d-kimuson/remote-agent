import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { History, Loader2, Plus, Save, Settings, X } from 'lucide-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { cn } from '@/web/lib/utils';

import type { ProjectSandboxNetworkMode, ProjectSandboxSettings } from '../../../../shared/acp.ts';

import { Button, buttonVariants } from '../../../components/ui/button.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { Label } from '../../../components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select.tsx';
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

type StringListEditorProps = {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly disabled: boolean;
  readonly items: readonly string[];
  readonly onItemsChange: (items: readonly string[]) => void;
};

const StringListEditor: FC<StringListEditorProps> = ({
  id,
  label,
  placeholder,
  disabled,
  items,
  onItemsChange,
}) => {
  const [value, setValue] = useState('');
  const addValue = (): void => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || items.includes(trimmed)) {
      setValue('');
      return;
    }
    onItemsChange([...items, trimmed]);
    setValue('');
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          disabled={disabled}
          id={id}
          onChange={(event) => {
            setValue(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addValue();
            }
          }}
          placeholder={placeholder}
          value={value}
        />
        <Button
          disabled={disabled || value.trim().length === 0}
          onClick={addValue}
          type="button"
          variant="outline"
        >
          <Plus className="size-4" />
          Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No entries.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1 text-sm"
              key={item}
            >
              <span className="min-w-0 break-all font-mono text-xs">{item}</span>
              <Button
                aria-label={`Remove ${item}`}
                disabled={disabled}
                onClick={() => {
                  onItemsChange(items.filter((entry) => entry !== item));
                }}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const sandboxFromState = ({
  enabled,
  allowRead,
  denyRead,
  allowWrite,
  denyWrite,
  networkMode,
  allowedDomains,
}: {
  readonly enabled: boolean;
  readonly allowRead: readonly string[];
  readonly denyRead: readonly string[];
  readonly allowWrite: readonly string[];
  readonly denyWrite: readonly string[];
  readonly networkMode: ProjectSandboxNetworkMode;
  readonly allowedDomains: readonly string[];
}): ProjectSandboxSettings => ({
  enabled,
  filesystem: {
    allowRead: [...allowRead],
    denyRead: [...denyRead],
    allowWrite: [...allowWrite],
    denyWrite: [...denyWrite],
  },
  network: {
    mode: networkMode,
    allowedDomains: [...allowedDomains],
  },
});

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
  const [sandboxEnabled, setSandboxEnabled] = useState(settingsData.settings.sandbox.enabled);
  const [sandboxAllowRead, setSandboxAllowRead] = useState<readonly string[]>(
    settingsData.settings.sandbox.filesystem.allowRead,
  );
  const [sandboxDenyRead, setSandboxDenyRead] = useState<readonly string[]>(
    settingsData.settings.sandbox.filesystem.denyRead,
  );
  const [sandboxAllowWrite, setSandboxAllowWrite] = useState<readonly string[]>(
    settingsData.settings.sandbox.filesystem.allowWrite,
  );
  const [sandboxDenyWrite, setSandboxDenyWrite] = useState<readonly string[]>(
    settingsData.settings.sandbox.filesystem.denyWrite,
  );
  const [sandboxNetworkMode, setSandboxNetworkMode] = useState<ProjectSandboxNetworkMode>(
    settingsData.settings.sandbox.network.mode,
  );
  const [sandboxAllowedDomains, setSandboxAllowedDomains] = useState<readonly string[]>(
    settingsData.settings.sandbox.network.allowedDomains,
  );
  const sandboxSettings = sandboxFromState({
    enabled: sandboxEnabled,
    allowRead: sandboxAllowRead,
    denyRead: sandboxDenyRead,
    allowWrite: sandboxAllowWrite,
    denyWrite: sandboxDenyWrite,
    networkMode: sandboxNetworkMode,
    allowedDomains: sandboxAllowedDomains,
  });
  const updateSettingsMutation = useMutation({
    mutationFn: () =>
      updateProjectSettingsRequest(projectId, {
        name: projectName,
        worktreeSetupScript,
        sandbox: sandboxSettings,
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
    worktreeSetupScript !== settingsData.settings.worktreeSetupScript ||
    JSON.stringify(sandboxSettings) !== JSON.stringify(settingsData.settings.sandbox);

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

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="font-medium">Sandbox</h2>
                    <p className="text-sm text-muted-foreground">
                      Provider-level sandbox must also be enabled in global Settings.
                    </p>
                  </div>
                  <button
                    aria-checked={sandboxEnabled}
                    aria-label={
                      sandboxEnabled
                        ? 'Disable sandbox by default for this project'
                        : 'Enable sandbox by default for this project'
                    }
                    className={cn(
                      'inline-flex h-6 min-w-11 items-center rounded-full border px-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      sandboxEnabled
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-muted text-muted-foreground',
                    )}
                    disabled={updateSettingsMutation.isPending}
                    onClick={() => {
                      setSandboxEnabled((current) => !current);
                    }}
                    role="switch"
                    type="button"
                  >
                    <span
                      className={cn(
                        'size-[18px] rounded-full bg-background shadow-sm transition-transform',
                        sandboxEnabled ? 'translate-x-5' : 'translate-x-0',
                      )}
                    />
                    <span className="sr-only">{sandboxEnabled ? 'Enabled' : 'Disabled'}</span>
                  </button>
                </div>
                {sandboxEnabled ? (
                  <div className="space-y-5">
                    <p className="text-sm text-muted-foreground">
                      Relative paths are resolved from the session working directory.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <StringListEditor
                        disabled={updateSettingsMutation.isPending}
                        id="sandbox-allow-read"
                        items={sandboxAllowRead}
                        label="Read allow paths"
                        onItemsChange={setSandboxAllowRead}
                        placeholder="."
                      />
                      <StringListEditor
                        disabled={updateSettingsMutation.isPending}
                        id="sandbox-deny-read"
                        items={sandboxDenyRead}
                        label="Read deny paths"
                        onItemsChange={setSandboxDenyRead}
                        placeholder="~/.ssh"
                      />
                      <StringListEditor
                        disabled={updateSettingsMutation.isPending}
                        id="sandbox-allow-write"
                        items={sandboxAllowWrite}
                        label="Write allow paths"
                        onItemsChange={setSandboxAllowWrite}
                        placeholder="."
                      />
                      <StringListEditor
                        disabled={updateSettingsMutation.isPending}
                        id="sandbox-deny-write"
                        items={sandboxDenyWrite}
                        label="Write deny paths"
                        onItemsChange={setSandboxDenyWrite}
                        placeholder=".env"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
                      <div className="space-y-1">
                        <Label htmlFor="sandbox-network-mode">Network policy</Label>
                        <p className="text-sm text-muted-foreground">
                          Inherit uses the global network policy. Restrict uses this project's
                          domain allowlist.
                        </p>
                      </div>
                      <Select
                        disabled={updateSettingsMutation.isPending}
                        onValueChange={(value) => {
                          setSandboxNetworkMode(
                            value === 'restrict'
                              ? 'restrict'
                              : value === 'none'
                                ? 'none'
                                : 'inherit',
                          );
                        }}
                        value={sandboxNetworkMode}
                      >
                        <SelectTrigger id="sandbox-network-mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inherit">Inherit</SelectItem>
                          <SelectItem value="restrict">Restrict</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {sandboxNetworkMode === 'restrict' ? (
                      <StringListEditor
                        disabled={updateSettingsMutation.isPending}
                        id="sandbox-allowed-domains"
                        items={sandboxAllowedDomains}
                        label="Network allowed domains"
                        onItemsChange={setSandboxAllowedDomains}
                        placeholder="github.com"
                      />
                    ) : null}
                  </div>
                ) : null}
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
