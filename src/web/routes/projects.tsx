import { createFileRoute, Outlet } from "@tanstack/react-router";

const ProjectsLayout = () => {
  return <Outlet />;
};

export const Route = createFileRoute("/projects")({
  component: ProjectsLayout,
});
