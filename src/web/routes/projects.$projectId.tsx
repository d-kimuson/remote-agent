import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { ProjectChatPage } from "../app/projects/$projectId/project-chat-page.tsx";

const ProjectChatRoute = () => {
  const { projectId } = Route.useParams();
  return (
    <Suspense>
      <ProjectChatPage projectId={projectId} />
    </Suspense>
  );
};

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectChatRoute,
});
