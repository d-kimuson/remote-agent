import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { Suspense, type FC } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="min-w-0 shrink-0 pr-9">
          <DialogTitle>{t('setup.initialTitle')}</DialogTitle>
          <DialogDescription>{t('setup.initialDescription')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain py-2 pr-1 [scrollbar-gutter:stable]">
          <Suspense
            fallback={
              <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
                {t('setup.loadingSettings')}
              </div>
            }
          >
            <ProviderSettingsPanel />
            <AppearanceSettingsPanel />
            <NotificationsSettingsPanel />
          </Suspense>
        </div>
        <DialogFooter className="shrink-0 gap-2">
          {hasEnabledProvider ? null : (
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              {t('setup.enableProviderFirst')}
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
                {t('setup.saving')}
              </>
            ) : (
              <>
                <Check className="size-4" />
                {t('setup.startUsing')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
