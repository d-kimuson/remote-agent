import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';

import { ProjectSettingsPage } from '../../../app/projects/$projectId/project-settings-page.tsx';

const ProjectSettingsRoute = () => {
  const { projectId } = Route.useParams();
  return (
    <Suspense>
      <ProjectSettingsPage key={projectId} projectId={projectId} />
    </Suspense>
  );
};

export const Route = createFileRoute('/projects/$projectId/settings')({
  component: ProjectSettingsRoute,
});
