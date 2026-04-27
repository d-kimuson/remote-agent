import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { ProjectListPage } from "../app/projects/index/project-list-page.tsx";

export const Route = createFileRoute("/projects/")({
  component: () => (
    <Suspense>
      <ProjectListPage />
    </Suspense>
  ),
});
