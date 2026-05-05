import { createFileRoute, Navigate } from '@tanstack/react-router';
import { type FC } from 'react';

const ProjectSettingsRoute: FC = () => {
  const { projectId } = Route.useParams();
  return <Navigate replace search={{ projectId }} to="/settings" />;
};

export const Route = createFileRoute('/projects/$projectId/settings')({
  component: ProjectSettingsRoute,
});
