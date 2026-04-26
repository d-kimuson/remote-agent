import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FC } from "react";

import type { RawEvent, SessionSummary } from "../../shared/acp.ts";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import {
  createSessionRequest,
  deleteSessionRequest,
  fetchAppInfo,
  fetchFilesystemTree,
  fetchProject,
  fetchSessions,
  sendPromptRequest,
  updateSessionRequest,
} from "../lib/api/acp.ts";
import { cn } from "../lib/utils.ts";

type ChatMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly rawEvents: readonly RawEvent[];
};

type TranscriptMap = Record<string, readonly ChatMessage[]>;

const appInfoQueryKey = ["app-info"] as const;
const sessionsQueryKey = ["sessions"] as const;
const projectQueryKey = (projectId: string) => ["project", projectId] as const;
const filesystemTreeQueryKey = (root: string) => ["filesystem-tree", root] as const;

const createChatMessage = (
  role: ChatMessage["role"],
  text: string,
  rawEvents: readonly RawEvent[] = [],
): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  text,
  rawEvents,
});

const selectedSessionFrom = (
  sessions: readonly SessionSummary[],
  selectedSessionId: string | null,
): SessionSummary | null => {
  return sessions.find((session) => session.sessionId === selectedSessionId) ?? sessions[0] ?? null;
};

const SessionListItem: FC<{
  readonly session: SessionSummary;
  readonly selected: boolean;
  readonly onSelect: (sessionId: string) => void;
}> = ({ session, selected, onSelect }) => {
  return (
    <button
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/50",
      )}
      onClick={() => {
        onSelect(session.sessionId);
      }}
      type="button"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-medium">{session.command}</p>
        <Badge variant="outline">{session.presetId ?? "custom"}</Badge>
      </div>
      <p className="mt-2 font-mono text-xs text-muted-foreground">{session.sessionId}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {session.currentModelId ?? "default model"}
      </p>
    </button>
  );
};

const ProjectChatPage: FC = () => {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const projectQuery = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
  });
  const appInfoQuery = useQuery({ queryKey: appInfoQueryKey, queryFn: fetchAppInfo });
  const sessionsQuery = useQuery({ queryKey: sessionsQueryKey, queryFn: fetchSessions });

  const project = projectQuery.data?.project ?? null;
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [transcripts, setTranscripts] = useState<TranscriptMap>({});
  const [attachedFiles, setAttachedFiles] = useState<readonly string[]>([]);
  const [isCreateSessionDialogOpen, setIsCreateSessionDialogOpen] = useState(false);
  const [isAttachDialogOpen, setIsAttachDialogOpen] = useState(false);
  const [browserRootPath, setBrowserRootPath] = useState("");
  const [newSessionPresetId, setNewSessionPresetId] = useState("codex");

  const projectSessions = useMemo(() => {
    return (sessionsQuery.data?.sessions ?? []).filter(
      (session) => session.projectId === projectId,
    );
  }, [projectId, sessionsQuery.data?.sessions]);
  const selectedSession = selectedSessionFrom(projectSessions, selectedSessionId);
  const transcript = selectedSession === null ? [] : (transcripts[selectedSession.sessionId] ?? []);

  useEffect(() => {
    if (selectedSessionId !== null) {
      return;
    }

    if (projectSessions.length > 0) {
      setSelectedSessionId(projectSessions[0]?.sessionId ?? null);
    }
  }, [projectSessions, selectedSessionId]);

  const filesystemRoot =
    browserRootPath.length > 0 ? browserRootPath : (project?.workingDirectory ?? "");
  const filesystemTreeQuery = useQuery({
    enabled: isAttachDialogOpen && project !== null,
    queryKey: filesystemTreeQueryKey(filesystemRoot),
    queryFn: () => fetchFilesystemTree(filesystemRoot),
  });

  const createSessionMutation = useMutation({
    mutationFn: createSessionRequest,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
      setSelectedSessionId(response.session.sessionId);
      setIsCreateSessionDialogOpen(false);
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({
      sessionId,
      modelId,
      modeId,
    }: {
      readonly sessionId: string;
      readonly modelId?: string | null;
      readonly modeId?: string | null;
    }) => updateSessionRequest(sessionId, { modelId, modeId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    },
  });

  const closeSessionMutation = useMutation({
    mutationFn: deleteSessionRequest,
    onSuccess: async (_, sessionId) => {
      await queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
      setSelectedSessionId((current) => (current === sessionId ? null : current));
    },
  });

  const sendPromptMutation = useMutation({
    mutationFn: ({
      sessionId,
      nextPrompt,
    }: {
      readonly sessionId: string;
      readonly nextPrompt: string;
    }) => sendPromptRequest(sessionId, nextPrompt),
  });

  const handleCreateSession = async () => {
    if (project === null) {
      return;
    }

    await createSessionMutation.mutateAsync({
      projectId: project.id,
      presetId: newSessionPresetId,
      command: null,
      argsText: "",
      cwd: project.workingDirectory,
    });
  };

  const handleToggleFile = (path: string) => {
    setAttachedFiles((current) =>
      current.includes(path) ? current.filter((entry) => entry !== path) : [...current, path],
    );
  };

  const handleSendPrompt = async () => {
    if (selectedSession === null || prompt.trim().length === 0) {
      return;
    }

    const attachmentBlock =
      attachedFiles.length === 0
        ? ""
        : `\n\nAttached files:\n${attachedFiles.map((path) => `- ${path}`).join("\n")}`;
    const nextPrompt = `${prompt}${attachmentBlock}`;

    setPrompt("");
    setTranscripts((current) => ({
      ...current,
      [selectedSession.sessionId]: [
        ...(current[selectedSession.sessionId] ?? []),
        createChatMessage("user", nextPrompt),
      ],
    }));

    try {
      const response = await sendPromptMutation.mutateAsync({
        sessionId: selectedSession.sessionId,
        nextPrompt,
      });

      setTranscripts((current) => ({
        ...current,
        [selectedSession.sessionId]: [
          ...(current[selectedSession.sessionId] ?? []),
          createChatMessage("assistant", response.text, response.rawEvents),
        ],
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to send prompt";
      setTranscripts((current) => ({
        ...current,
        [selectedSession.sessionId]: [
          ...(current[selectedSession.sessionId] ?? []),
          createChatMessage("assistant", `Error: ${message}`),
        ],
      }));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <Link className={cn(buttonVariants({ variant: "outline" }), "w-fit")} to="/projects">
              <ArrowLeft className="size-4" />
              Back to projects
            </Link>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {project?.name ?? "Loading..."}
              </h1>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {project?.workingDirectory ?? ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">project: {projectId}</Badge>
            <Badge variant="secondary">
              presets: {appInfoQuery.data?.agentPresets.length ?? 0}
            </Badge>
          </div>
        </header>

        <section className="grid min-h-[calc(100vh-180px)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="min-h-0">
            <CardHeader>
              <CardTitle>Chat</CardTitle>
              <CardDescription>
                {selectedSession === null
                  ? "右側から session を作成してください。"
                  : `${selectedSession.command} / ${selectedSession.sessionId}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
              <ScrollArea className="h-[52vh] rounded-lg border">
                <div className="space-y-4 p-4">
                  {transcript.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      会話履歴はまだありません。
                    </div>
                  ) : null}

                  {transcript.map((message) => (
                    <div
                      className={cn(
                        "max-w-[85%] rounded-xl border px-4 py-3",
                        message.role === "user"
                          ? "ml-auto border-primary bg-primary text-primary-foreground"
                          : "bg-background",
                      )}
                      key={message.id}
                    >
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
                        {message.role}
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="space-y-3 rounded-lg border p-3">
                <Textarea
                  className="min-h-32"
                  onChange={(event) => {
                    setPrompt(event.target.value);
                  }}
                  placeholder="Type your message"
                  value={prompt}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-40 flex-1 sm:flex-none">
                    <Select
                      onValueChange={(value) => {
                        if (selectedSession !== null && value !== null) {
                          void updateSessionMutation.mutateAsync({
                            sessionId: selectedSession.sessionId,
                            modelId: value,
                          });
                        }
                      }}
                      value={selectedSession?.currentModelId ?? undefined}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Model" />
                      </SelectTrigger>
                      <SelectContent>
                        {(selectedSession?.availableModels ?? []).map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-40 flex-1 sm:flex-none">
                    <Select
                      onValueChange={(value) => {
                        if (selectedSession !== null && value !== null) {
                          void updateSessionMutation.mutateAsync({
                            sessionId: selectedSession.sessionId,
                            modeId: value,
                          });
                        }
                      }}
                      value={selectedSession?.currentModeId ?? undefined}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Effort" />
                      </SelectTrigger>
                      <SelectContent>
                        {(selectedSession?.availableModes ?? []).map((mode) => (
                          <SelectItem key={mode.id} value={mode.id}>
                            {mode.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={() => {
                      setIsAttachDialogOpen(true);
                    }}
                    type="button"
                    variant="outline"
                  >
                    <Paperclip className="size-4" />
                    Attach
                  </Button>

                  <Button
                    disabled={selectedSession === null || sendPromptMutation.isPending}
                    onClick={() => {
                      void handleSendPrompt();
                    }}
                    type="button"
                  >
                    <Send className="size-4" />
                    {sendPromptMutation.isPending ? "Sending..." : "Send"}
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">provider: {selectedSession?.presetId ?? "none"}</Badge>
                  {attachedFiles.map((path) => (
                    <Badge key={path} variant="secondary">
                      <Paperclip className="size-3" />
                      {path}
                    </Badge>
                  ))}
                  {attachedFiles.length === 0 ? <span>No attached files</span> : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0">
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
              <CardDescription>右側で session を切り替えます。</CardDescription>
              <CardAction>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      void sessionsQuery.refetch();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                  <Button
                    onClick={() => {
                      setIsCreateSessionDialogOpen(true);
                    }}
                    size="sm"
                    type="button"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              {projectSessions.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  session がまだありません。
                </div>
              ) : null}

              <div className="space-y-2">
                {projectSessions.map((session) => (
                  <div className="space-y-2" key={session.sessionId}>
                    <SessionListItem
                      onSelect={setSelectedSessionId}
                      selected={session.sessionId === selectedSession?.sessionId}
                      session={session}
                    />
                    {session.sessionId === selectedSession?.sessionId ? (
                      <Button
                        className="w-full"
                        disabled={closeSessionMutation.isPending}
                        onClick={() => {
                          void closeSessionMutation.mutateAsync(session.sessionId);
                        }}
                        type="button"
                        variant="outline"
                      >
                        <Trash2 className="size-4" />
                        Close session
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>

              {createSessionMutation.error instanceof Error ? (
                <p className="text-sm text-destructive">{createSessionMutation.error.message}</p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </div>

      {isCreateSessionDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>New Session</CardTitle>
              <CardDescription>provider を選んで ACP session を追加します。</CardDescription>
              <CardAction>
                <Button
                  onClick={() => {
                    setIsCreateSessionDialogOpen(false);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <X className="size-4" />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Provider</p>
                <Select
                  onValueChange={(value) => {
                    if (value !== null) {
                      setNewSessionPresetId(value);
                    }
                  }}
                  value={newSessionPresetId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(appInfoQuery.data?.agentPresets ?? [])
                      .filter((preset) => ["codex", "pi", "custom"].includes(preset.id))
                      .map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setIsCreateSessionDialogOpen(false);
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  disabled={project === null || createSessionMutation.isPending}
                  onClick={() => {
                    void handleCreateSession();
                  }}
                  type="button"
                >
                  <MessageSquare className="size-4" />
                  {createSessionMutation.isPending ? "Connecting..." : "Create session"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isAttachDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="flex h-[80vh] w-full max-w-3xl flex-col">
            <CardHeader>
              <CardTitle>Attach files</CardTitle>
              <CardDescription>prompt にファイルパスを添付します。</CardDescription>
              <CardAction>
                <Button
                  onClick={() => {
                    setIsAttachDialogOpen(false);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <X className="size-4" />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="flex gap-2">
                <Input
                  onChange={(event) => {
                    setBrowserRootPath(event.target.value);
                  }}
                  placeholder={project?.workingDirectory ?? "/path/to/project"}
                  value={browserRootPath}
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

              <ScrollArea className="min-h-0 flex-1 rounded-lg border p-4">
                <FilesystemBrowser
                  attachedFiles={attachedFiles}
                  onOpenDirectory={setBrowserRootPath}
                  onToggleFile={handleToggleFile}
                  root={filesystemTreeQuery.data?.root ?? null}
                />
              </ScrollArea>

              <div className="flex flex-wrap gap-2">
                {attachedFiles.length === 0 ? (
                  <Badge variant="outline">No attached file</Badge>
                ) : null}
                {attachedFiles.map((path) => (
                  <Badge key={path} variant="secondary">
                    <Paperclip className="size-3" />
                    {path}
                  </Badge>
                ))}
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setIsAttachDialogOpen(false);
                  }}
                  type="button"
                >
                  Done
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
};

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectChatPage,
});
