import type { FC } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NativeAcpApi } from '../api/acp.ts';

import {
  BodyText,
  Button,
  ErrorState,
  LoadingState,
  Panel,
  RowButton,
  Screen,
  ScreenScroll,
} from '../components/native-shell.tsx';

export const ProvidersScreen: FC<{
  readonly api: NativeAcpApi;
  readonly onBack: () => void;
  readonly onOpenSettings: () => void;
}> = ({ api, onBack, onOpenSettings }) => {
  const queryClient = useQueryClient();
  const providersQuery = useQuery({
    queryKey: ['native', 'providers'],
    queryFn: api.fetchAgentProviders,
  });
  const updateProviderMutation = useMutation({
    mutationFn: ({ enabled, presetId }: { readonly presetId: string; readonly enabled: boolean }) =>
      api.updateAgentProvider(presetId, { enabled }),
    onSuccess: (response) => {
      queryClient.setQueryData(['native', 'providers'], response);
      void queryClient.invalidateQueries({ queryKey: ['native', 'providers'] });
    },
  });

  if (providersQuery.isLoading) {
    return <LoadingState label="Providers を読み込んでいます" />;
  }

  const action = (
    <>
      <Button onPress={onOpenSettings} variant="ghost">
        Settings
      </Button>
      <Button onPress={onBack} variant="ghost">
        Back
      </Button>
    </>
  );

  const error = providersQuery.error?.message ?? updateProviderMutation.error?.message ?? null;

  const providers = providersQuery.data?.providers ?? [];

  return (
    <Screen action={action} title="Providers">
      <ScreenScroll>
        {error !== null ? (
          <ErrorState
            message={error}
            onRetry={() => {
              void providersQuery.refetch();
            }}
          />
        ) : null}
        {providers.map((provider) => (
          <Panel key={provider.preset.id}>
            <BodyText>{provider.preset.label}</BodyText>
            {provider.preset.description.length > 0 ? (
              <BodyText muted>{provider.preset.description}</BodyText>
            ) : null}
            <BodyText muted>{provider.enabled ? 'Enabled' : 'Disabled'}</BodyText>
            <RowButton
              disabled={updateProviderMutation.isPending}
              label={provider.enabled ? 'Disable provider' : 'Enable provider'}
              onPress={() => {
                updateProviderMutation.mutate({
                  presetId: provider.preset.id,
                  enabled: !provider.enabled,
                });
              }}
              selected={provider.enabled}
            />
          </Panel>
        ))}
        {providers.length === 0 ? (
          <Panel>
            <BodyText muted>No providers found.</BodyText>
          </Panel>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
};
