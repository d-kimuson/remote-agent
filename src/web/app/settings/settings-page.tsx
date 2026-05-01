import type { FC } from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { fetchAppSetupState } from '../../lib/api/acp.ts';
import { appSetupStateQueryKey } from '../onboarding/queries.ts';
import {
  AppearanceSettingsPanel,
  KeybindingSettingsPanel,
  LanguageSettingsPanel,
  NotificationsSettingsPanel,
  ProviderSettingsPanel,
} from './settings-panels.tsx';

export const SettingsPage: FC = () => {
  const { t } = useTranslation();
  const { data: setupData } = useSuspenseQuery({
    queryKey: appSetupStateQueryKey,
    queryFn: fetchAppSetupState,
  });

  if (!setupData.setup.initialSetupCompleted) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        {t('settings.initialSetupOpen')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProviderSettingsPanel />
      <LanguageSettingsPanel />
      <AppearanceSettingsPanel />
      <KeybindingSettingsPanel />
      <NotificationsSettingsPanel />
    </div>
  );
};
