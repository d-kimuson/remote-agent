import { Link } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Paperclip, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FC } from "react";

import { Badge } from "../../../components/ui/badge.tsx";
import { Button, buttonVariants } from "../../../components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx";
import { ScrollArea } from "../../../components/ui/scroll-area.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select.tsx";
import { Textarea } from "../../../components/ui/textarea.tsx";
import {
  createSessionRequest,
  deleteSessionRequest,
  fetchAppInfo,
  fetchProject,
  fetchSessions,
  sendPromptRequest,
  updateSessionRequest,
} from "../../../lib/api/acp.ts";
import { cn } from "../../../lib/utils.ts";
import { AttachFilesDialog } from "./attach-files-dialog.tsx";
import { CreateSessionDialog } from "./create-session-dialog.tsx";
import {
  appInfoQueryKey,
  projectQueryKey,
  selectedSessionFrom,
  sessionsQueryKey,
} from "./queries.ts";
import { SessionListItem } from "./session-list-item.tsx";
import { createChatMessage, type TranscriptMap } from "./types.ts";

export const ProjectChatPage: FC<{ readonly projectId: string }> = ({ projectId }) => {
  const queryClient = useQueryClient();

  const { data: projectData } = useSuspenseQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
  });
  const { data: appInfoData } = useSuspenseQuery({
    queryKey: appInfoQueryKey,
    queryFn: fetchAppInfo,
  });
  const { data: sessionsData, refetch: refetchSessions } = useSuspenseQuery({
    queryKey: sessionsQueryKey,
    queryFn: fetchSessions,
  });

  const project = projectData.project;

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [transcripts, setTranscripts] = useState<TranscriptMap>({});
  const [attachedFiles, setAttachedFiles] = useState<readonly string[]>([]);
  const [isCreateSessionDialogOpen, setIsCreateSessionDialogOpen] = useState(false);
  const [isAttachDialogOpen, setIsAttachDialogOpen] = useState(false);
  const [newSessionPresetId, setNewSessionPresetId] = useState("codex");

  const projectSessions = useMemo(
    () => sessionsData.sessions.filter((session) => session.projectId === projectId),
    [projectId, sessionsData.sessions],
  );
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

  const handleCreateSession = () => {
    createSessionMutation.mutate({
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
              <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {project.workingDirectory}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">project: {projectId}</Badge>
            <Badge variant="secondary">presets: {appInfoData.agentPresets.length}</Badge>
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
                      void refetchSessions();
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
            </CardContent>
          </Card>
        </section>
      </div>

      {isCreateSessionDialogOpen ? (
        <CreateSessionDialog
          error={createSessionMutation.error instanceof Error ? createSessionMutation.error : null}
          isLoading={createSessionMutation.isPending}
          isProjectReady={true}
          onClose={() => {
            setIsCreateSessionDialogOpen(false);
          }}
          onCreateSession={handleCreateSession}
          onPresetIdChange={setNewSessionPresetId}
          presetId={newSessionPresetId}
          presets={appInfoData.agentPresets}
        />
      ) : null}

      {isAttachDialogOpen ? (
        <AttachFilesDialog
          attachedFiles={attachedFiles}
          onClose={() => {
            setIsAttachDialogOpen(false);
          }}
          onToggleFile={handleToggleFile}
          workingDirectory={project.workingDirectory}
        />
      ) : null}
    </div>
  );
};
