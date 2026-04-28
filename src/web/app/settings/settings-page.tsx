import type { FC } from 'react';

import {
  AppearanceSettingsPanel,
  NotificationsSettingsPanel,
  ProviderSettingsPanel,
} from './settings-panels.tsx';

export const SettingsPage: FC = () => {
  return (
    <div className="space-y-6">
      <ProviderSettingsPanel />
      <AppearanceSettingsPanel />
      <NotificationsSettingsPanel />
    </div>
  );
};
