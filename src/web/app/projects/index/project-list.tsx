import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FolderIcon } from "lucide-react";
import { useMemo, type FC } from "react";

import { buttonVariants } from "../../../components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx";
import { fetchProjects } from "../../../lib/api/acp.ts";
import { cn } from "../../../lib/utils.ts";

const projectsQueryKey = ["projects"] as const;

export const ProjectList: FC = () => {
  const { data } = useSuspenseQuery({
    queryKey: projectsQueryKey,
    queryFn: fetchProjects,
  });

  const projects = useMemo(
    () =>
      [...data.projects].sort((left, right) =>
        left.name.localeCompare(right.name, "ja-JP", { sensitivity: "base" }),
      ),
    [data.projects],
  );

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FolderIcon className="mb-4 size-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium">No projects yet</h3>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            Create a project from a working directory to start an ACP session.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <Card className="transition-shadow hover:shadow-md" key={project.id}>
          <CardHeader>
            <CardTitle className="flex items-start justify-start gap-2">
              <FolderIcon className="size-5 shrink-0" />
              <span className="flex-1 text-wrap">{project.name}</span>
            </CardTitle>
            <CardDescription className="break-all font-mono text-xs">
              {project.workingDirectory}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              className={cn(buttonVariants({ variant: "default" }), "w-full")}
              params={{ projectId: project.id }}
              to="/projects/$projectId"
            >
              Open
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export const ProjectListSkeleton: FC = () => (
  <div className="flex items-center justify-center py-12">
    <div className="text-sm text-muted-foreground">Loading projects...</div>
  </div>
);
