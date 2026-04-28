import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';

import { ProjectSessionListPage } from '../../../app/projects/$projectId/project-session-list-page.tsx';

const ProjectSessionsRoute = () => {
  const { projectId } = Route.useParams();
  return (
    <Suspense>
      <ProjectSessionListPage projectId={projectId} />
    </Suspense>
  );
};

export const Route = createFileRoute('/projects/$projectId/sessions')({
  component: ProjectSessionsRoute,
});
