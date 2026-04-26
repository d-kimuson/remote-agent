import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Plus, RefreshCw } from "lucide-react";
import { useState, type FC } from "react";

import { FilesystemBrowser } from "../features/filesystem-browser.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card.tsx";
import { Input } from "../components/ui/input.tsx";
import { ScrollArea } from "../components/ui/scroll-area.tsx";
import {
  createProjectRequest,
  fetchAppInfo,
  fetchFilesystemTree,
  fetchProjects,
} from "../lib/api/acp.ts";
import { cn } from "../lib/utils.ts";

const appInfoQueryKey = ["app-info"] as const;
const projectsQueryKey = ["projects"] as const;
const filesystemTreeQueryKey = (root: string) => ["filesystem-tree", root] as const;

const defaultProjectName = (workingDirectory: string): string => {
  const parts = workingDirectory.split("/").filter(Boolean);
  return parts.at(-1) ?? workingDirectory;
};

const ProjectListPage: FC = () => {
  const queryClient = useQueryClient();
  const appInfoQuery = useQuery({ queryKey: appInfoQueryKey, queryFn: fetchAppInfo });
  const projectsQuery = useQuery({ queryKey: projectsQueryKey, queryFn: fetchProjects });

  const [treeRootPath, setTreeRootPath] = useState("");
  const [selectedDirectoryPath, setSelectedDirectoryPath] = useState("");
  const [projectName, setProjectName] = useState("");

  const filesystemTreeQuery = useQuery({
    queryKey: filesystemTreeQueryKey(treeRootPath),
    queryFn: () => fetchFilesystemTree(treeRootPath),
  });

  const createProjectMutation = useMutation({
    mutationFn: createProjectRequest,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      setSelectedDirectoryPath(response.project.workingDirectory);
      setProjectName(response.project.name);
    },
  });

  const handleSelectDirectory = (path: string) => {
    setSelectedDirectoryPath(path);
    setProjectName((current) => (current.length > 0 ? current : defaultProjectName(path)));
  };

  const handleCreateProject = async () => {
    if (selectedDirectoryPath.length === 0) {
      return;
    }

    await createProjectMutation.mutateAsync({
      name: projectName.length > 0 ? projectName : defaultProjectName(selectedDirectoryPath),
      workingDirectory: selectedDirectoryPath,
    });
  };

  const projects = projectsQuery.data?.projects ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Badge variant="secondary">Projects</Badge>
            <h1 className="text-3xl font-semibold tracking-tight">ACP Playground</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              `projects.local.json` をデータソースにした project
              一覧です。必要ならディレクトリを選んで追加できます。
            </p>
          </div>
          <div className="space-y-1 text-sm text-muted-foreground md:text-right">
            <p>Working directory: {appInfoQuery.data?.workingDirectory ?? "..."}</p>
            <p>Projects file: {appInfoQuery.data?.projectsFilePath ?? "..."}</p>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Project List</CardTitle>
              <CardDescription>作成済み project を選んで chat UI に移動します。</CardDescription>
              <CardAction>
                <Button
                  onClick={() => {
                    void projectsQuery.refetch();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className="size-4" /> Refresh
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              {projects.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  project がまだありません。
                </div>
              ) : null}

              {projects.map((project) => (
                <div className="rounded-xl border p-4" key={project.id}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <FolderTree className="size-4 text-muted-foreground" />
                        <h2 className="font-medium">{project.name}</h2>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">{project.id}</p>
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        {project.workingDirectory}
                      </p>
                    </div>
                    <Link
                      className={cn(buttonVariants({ variant: "default" }), "justify-center")}
                      params={{ projectId: project.id }}
                      to="/projects/$projectId"
                    >
                      Open Chat
                    </Link>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Create Project</CardTitle>
              <CardDescription>
                ファイルシステムから workingDirectory を選んで project を追加します。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  onChange={(event) => {
                    setTreeRootPath(event.target.value);
                  }}
                  placeholder={appInfoQuery.data?.workingDirectory ?? "/path/to/root"}
                  value={treeRootPath}
                />
                <Button
                  onClick={() => {
                    void filesystemTreeQuery.refetch();
                  }}
                  type="button"
                  variant="outline"
                >
                  Load
                </Button>
              </div>

              <ScrollArea className="h-96 rounded-lg border p-4">
                <FilesystemBrowser
                  onOpenDirectory={setTreeRootPath}
                  onSelectDirectory={handleSelectDirectory}
                  root={filesystemTreeQuery.data?.root ?? null}
                  selectedDirectoryPath={selectedDirectoryPath}
                />
              </ScrollArea>

              <div className="grid gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="project-name">
                    Project name
                  </label>
                  <Input
                    id="project-name"
                    onChange={(event) => {
                      setProjectName(event.target.value);
                    }}
                    placeholder="my-project"
                    value={projectName}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="working-directory">
                    Working directory
                  </label>
                  <Input id="working-directory" readOnly value={selectedDirectoryPath} />
                </div>
              </div>

              <Button
                className="w-full"
                disabled={selectedDirectoryPath.length === 0 || createProjectMutation.isPending}
                onClick={() => {
                  void handleCreateProject();
                }}
                type="button"
              >
                <Plus className="size-4" />
                {createProjectMutation.isPending ? "Creating..." : "Create Project"}
              </Button>

              {createProjectMutation.error instanceof Error ? (
                <p className="text-sm text-destructive">{createProjectMutation.error.message}</p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/projects/")({
  component: ProjectListPage,
});
