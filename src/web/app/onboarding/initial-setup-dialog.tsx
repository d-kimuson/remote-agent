import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { Suspense, type FC } from 'react';

import type { AppSetupStateResponse } from '../../../shared/acp.ts';

import { Button } from '../../components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.tsx';
import {
  completeInitialSetupRequest,
  fetchAgentProviders,
  fetchAppSetupState,
} from '../../lib/api/acp.ts';
import { agentProvidersQueryKey } from '../projects/$projectId/queries.ts';
import {
  AppearanceSettingsPanel,
  NotificationsSettingsPanel,
  ProviderSettingsPanel,
} from '../settings/settings-panels.tsx';
import { appSetupStateQueryKey } from './queries.ts';

export const InitialSetupDialog: FC = () => {
  const queryClient = useQueryClient();
  const { data: setupData } = useSuspenseQuery({
    queryKey: appSetupStateQueryKey,
    queryFn: fetchAppSetupState,
  });
  const { data: providerData } = useSuspenseQuery({
    queryKey: agentProvidersQueryKey,
    queryFn: fetchAgentProviders,
  });
  const completeSetupMutation = useMutation({
    mutationFn: completeInitialSetupRequest,
    onSuccess: (data) => {
      queryClient.setQueryData<AppSetupStateResponse>(appSetupStateQueryKey, data);
    },
  });

  if (setupData.setup.initialSetupCompleted) {
    return null;
  }

  const hasEnabledProvider = providerData.providers.some((entry) => entry.enabled);

  return (
    <Dialog open>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Initial setup</DialogTitle>
          <DialogDescription>
            まず利用する ACP provider を 1
            つ以上有効にしてください。必要ならテーマと通知もここで設定できます。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Suspense
            fallback={
              <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
                Loading settings...
              </div>
            }
          >
            <ProviderSettingsPanel />
            <AppearanceSettingsPanel />
            <NotificationsSettingsPanel />
          </Suspense>
        </div>
        <DialogFooter className="gap-2">
          {hasEnabledProvider ? null : (
            <p className="text-sm text-muted-foreground">
              セッション作成に進むには Provider を 1 つ以上有効にしてください。
            </p>
          )}
          <Button
            disabled={!hasEnabledProvider || completeSetupMutation.isPending}
            onClick={() => {
              completeSetupMutation.mutate();
            }}
            type="button"
          >
            {completeSetupMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="size-4" />
                Start using Remote Agent
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
