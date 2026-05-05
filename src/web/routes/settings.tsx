import { createFileRoute } from '@tanstack/react-router';
import { Suspense, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { ProjectSettingsPage } from '../app/projects/$projectId/project-settings-page.tsx';
import { SettingsPage } from '../app/settings/settings-page.tsx';

type SettingsSearch = {
  readonly projectId?: string;
};

const SettingsRoute: FC = () => {
  const { t } = useTranslation();
  const search = Route.useSearch();

  if (search.projectId !== undefined) {
    return (
      <Suspense>
        <ProjectSettingsPage key={search.projectId} projectId={search.projectId} />
      </Suspense>
    );
  }

  return (
    <div className="app-page">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-3 border-b pb-5">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t('settings.title')}
          </h1>
        </header>
        <SettingsPage />
      </div>
    </div>
  );
};

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const projectId = search['projectId'];
    return {
      projectId: typeof projectId === 'string' && projectId.length > 0 ? projectId : undefined,
    };
  },
});
