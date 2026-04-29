import type { FC } from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import { fetchAppSetupState } from '../../lib/api/acp.ts';
import { appSetupStateQueryKey } from '../onboarding/queries.ts';
import {
  AppearanceSettingsPanel,
  NotificationsSettingsPanel,
  ProviderSettingsPanel,
} from './settings-panels.tsx';

export const SettingsPage: FC = () => {
  const { data: setupData } = useSuspenseQuery({
    queryKey: appSetupStateQueryKey,
    queryFn: fetchAppSetupState,
  });

  if (!setupData.setup.initialSetupCompleted) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        Initial setup is open. Complete it to edit the full settings page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProviderSettingsPanel />
      <AppearanceSettingsPanel />
      <NotificationsSettingsPanel />
    </div>
  );
};
