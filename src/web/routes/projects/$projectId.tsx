import { Outlet, createFileRoute } from '@tanstack/react-router';

const ProjectLayoutRoute = () => <Outlet />;

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectLayoutRoute,
});
