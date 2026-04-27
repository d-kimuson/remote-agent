import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { ProjectChatPage } from "../app/projects/$projectId/project-chat-page.tsx";

type ProjectChatSearch = {
  readonly "session-id"?: string;
};

const ProjectChatRoute = () => {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <Suspense>
      <ProjectChatPage projectId={projectId} sessionId={search["session-id"] ?? null} />
    </Suspense>
  );
};

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectChatRoute,
  validateSearch: (search: Record<string, unknown>): ProjectChatSearch => {
    const sessionId = search["session-id"];
    return {
      "session-id": typeof sessionId === "string" && sessionId.length > 0 ? sessionId : undefined,
    };
  },
});
