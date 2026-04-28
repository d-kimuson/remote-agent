import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useState, type FC } from 'react';

import type { AgentProvidersResponse } from '../../../shared/acp.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card.tsx';
import { Checkbox } from '../../components/ui/checkbox.tsx';
import { Label } from '../../components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select.tsx';
import {
  checkAgentProviderRequest,
  fetchAgentProviders,
  updateAgentProviderRequest,
} from '../../lib/api/acp.ts';
import { parseThemePreference, type ThemePreference } from '../../lib/theme.pure.ts';
import { useTheme } from '../../lib/theme.tsx';
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  showNotificationPreview,
} from '../../pwa/notifications.ts';
import { agentProvidersQueryKey } from '../projects/$projectId/queries.ts';

const themePreferenceChoices = [
  {
    value: 'system',
    label: 'System',
    description: 'OS の外観設定に合わせます。',
  },
  {
    value: 'light',
    label: 'Light',
    description: '常にライトテーマを使います。',
  },
  {
    value: 'dark',
    label: 'Dark',
    description: '常にダークテーマを使います。',
  },
] as const satisfies readonly {
  readonly value: ThemePreference;
  readonly label: string;
  readonly description: string;
}[];

export const SettingsPage: FC = () => {
  const queryClient = useQueryClient();
  const { preference, resolvedTheme, setPreference } = useTheme();
  const { data: providerData } = useSuspenseQuery({
    queryKey: agentProvidersQueryKey,
    queryFn: fetchAgentProviders,
  });
  const [notificationPermission, setNotificationPermission] = useState(
    getNotificationPermissionState,
  );
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [providerCheckState, setProviderCheckState] = useState<
    Readonly<
      Record<string, { readonly status: 'checking' | 'ok' | 'error'; readonly message: string }>
    >
  >({});
  const updateProviderMutation = useMutation({
    mutationFn: ({ enabled, presetId }: { readonly presetId: string; readonly enabled: boolean }) =>
      updateAgentProviderRequest(presetId, { enabled }),
    onSuccess: (data) => {
      queryClient.setQueryData<AgentProvidersResponse>(agentProvidersQueryKey, data);
    },
  });
  const checkProviderMutation = useMutation({
    mutationFn: ({ presetId }: { readonly presetId: string }) =>
      checkAgentProviderRequest(presetId, { cwd: null }),
  });

  const handleProviderToggle = async ({
    enabled,
    presetId,
  }: {
    readonly presetId: string;
    readonly enabled: boolean;
  }) => {
    const response = await updateProviderMutation.mutateAsync({ presetId, enabled });
    if (!enabled) {
      setProviderCheckState((current) => ({
        ...current,
        [presetId]: { status: 'ok', message: 'Disabled' },
      }));
      return;
    }

    setProviderCheckState((current) => ({
      ...current,
      [presetId]: { status: 'checking', message: 'Checking...' },
    }));
    try {
      const catalog = await checkProviderMutation.mutateAsync({ presetId });
      setProviderCheckState((current) => ({
        ...current,
        [presetId]: {
          status: 'ok',
          message: `OK · ${String(catalog.availableModels.length)} models · ${String(catalog.availableModes.length)} modes`,
        },
      }));
    } catch (error) {
      setProviderCheckState((current) => ({
        ...current,
        [presetId]: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Check failed',
        },
      }));
    }
    queryClient.setQueryData<AgentProvidersResponse>(agentProvidersQueryKey, response);
  };

  useEffect(() => {
    const syncNotificationPermission = () => {
      setNotificationPermission(getNotificationPermissionState());
    };

    syncNotificationPermission();
    window.addEventListener('focus', syncNotificationPermission);

    return () => {
      window.removeEventListener('focus', syncNotificationPermission);
    };
  }, []);

  const handleEnableNotifications = async () => {
    const nextPermission = await requestNotificationPermission();
    setNotificationPermission(nextPermission);

    if (nextPermission === 'denied') {
      setNotificationError('通知が拒否されています。ブラウザ設定から許可してください。');
      return;
    }

    if (nextPermission === 'unsupported') {
      setNotificationError('この環境では Service Worker 通知を利用できません。');
      return;
    }

    setNotificationError(null);
  };

  const handlePreviewNotification = async () => {
    const didShowNotification = await showNotificationPreview({
      projectId: 'settings',
      projectName: 'ACP Playground',
      sessionId: 'settings',
      text: 'バックグラウンド時の assistant 応答をこの形式で通知します。',
      timestamp: Date.now(),
      url: '/settings',
    });

    if (!didShowNotification) {
      setNotificationError('通知を表示できませんでした。先に通知を許可してください。');
      return;
    }

    setNotificationError(null);
  };

  return (
    <div className="space-y-6">
      <Card className="app-panel">
        <CardHeader>
          <CardTitle>Providers</CardTitle>
          <CardDescription>プロジェクトで利用する ACP provider を選択します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {providerData.providers.map((entry) => (
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 px-3 py-3"
              htmlFor={`provider-${entry.preset.id}`}
              key={entry.preset.id}
            >
              <Checkbox
                checked={entry.enabled}
                disabled={updateProviderMutation.isPending || checkProviderMutation.isPending}
                id={`provider-${entry.preset.id}`}
                onCheckedChange={(checked) => {
                  void handleProviderToggle({
                    presetId: entry.preset.id,
                    enabled: checked === true,
                  });
                }}
              />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{entry.preset.label}</span>
                  <Badge variant={entry.enabled ? 'default' : 'outline'}>
                    {entry.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </span>
                <span className="block text-sm text-muted-foreground">
                  {entry.preset.description}
                </span>
                <span className="block break-all font-mono text-xs text-muted-foreground">
                  {entry.preset.command} {entry.preset.args.join(' ')}
                </span>
                {providerCheckState[entry.preset.id] === undefined ? null : (
                  <span
                    className={
                      providerCheckState[entry.preset.id]?.status === 'error'
                        ? 'block text-xs text-destructive'
                        : 'block text-xs text-muted-foreground'
                    }
                  >
                    {providerCheckState[entry.preset.id]?.message}
                  </span>
                )}
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card className="app-panel">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>UI の配色テーマを設定します。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
          <div className="space-y-1">
            <Label htmlFor="theme-preference">Theme</Label>
            <p className="text-sm text-muted-foreground">
              現在の表示は <span className="font-medium text-foreground">{resolvedTheme}</span>{' '}
              です。
            </p>
          </div>
          <Select
            onValueChange={(nextPreference) => {
              setPreference(parseThemePreference(nextPreference));
            }}
            value={preference}
          >
            <SelectTrigger className="w-full" id="theme-preference">
              <SelectValue placeholder="Theme" />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-64">
              {themePreferenceChoices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  <div className="flex flex-col">
                    <span>{choice.label}</span>
                    <span className="text-xs text-muted-foreground">{choice.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="app-panel">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            バックグラウンド時の assistant 応答を Service Worker 通知で受け取るための設定。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{notificationPermission}</Badge>
            <Button
              disabled={
                notificationPermission === 'denied' ||
                notificationPermission === 'granted' ||
                notificationPermission === 'unsupported'
              }
              onClick={() => {
                void handleEnableNotifications();
              }}
              type="button"
              variant="outline"
            >
              Enable
            </Button>
            <Button
              disabled={notificationPermission !== 'granted'}
              onClick={() => {
                void handlePreviewNotification();
              }}
              type="button"
              variant="outline"
            >
              Test
            </Button>
          </div>
          {notificationError === null ? null : (
            <p className="text-xs text-destructive">{notificationError}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
