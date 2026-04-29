import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';

import { ProjectRoutinesPage } from '../../../app/projects/$projectId/project-routines-page.tsx';

const ProjectRoutinesRoute = () => {
  const { projectId } = Route.useParams();
  return (
    <Suspense>
      <ProjectRoutinesPage projectId={projectId} />
    </Suspense>
  );
};

export const Route = createFileRoute('/projects/$projectId/routines')({
  component: ProjectRoutinesRoute,
});
