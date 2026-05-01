import { useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, type FC } from 'react';

import { appSettingsQueryKey } from '../../app/settings/queries.ts';
import { fetchAppSettings } from '../api/acp.ts';
import { i18n } from './i18n.ts';

export const LanguageSync: FC = () => {
  const { data } = useSuspenseQuery({
    queryKey: appSettingsQueryKey,
    queryFn: fetchAppSettings,
  });

  useEffect(() => {
    if (i18n.language !== data.settings.language) {
      void i18n.changeLanguage(data.settings.language);
    }
  }, [data]);

  return null;
};
