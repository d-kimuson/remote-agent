import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { startTransition, useDeferredValue, useState, type FC } from "react";
import {
  Bot,
  FolderRoot,
  GitBranchPlus,
  MessageSquareText,
  ScanSearch,
  Sparkles,
  SplitSquareVertical,
  TerminalSquare,
} from "lucide-react";

import type { AgentPreset, RawEvent, SessionSummary } from "@/shared/acp";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/web/components/ui/card";
import { Input } from "@/web/components/ui/input";
import { ScrollArea } from "@/web/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/web/components/ui/select";
import { Separator } from "@/web/components/ui/separator";
import { Textarea } from "@/web/components/ui/textarea";
import {
  createSessionRequest,
  deleteSessionRequest,
  fetchAppInfo,
  fetchSessions,
  sendPromptRequest,
  updateSessionRequest,
} from "@/web/lib/api/acp";
import { cn } from "@/web/lib/utils";

type TranscriptMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly rawEvents: readonly RawEvent[];
};

type SessionTranscriptMap = Record<string, readonly TranscriptMessage[]>;

const sessionQueryKey = ["sessions"] as const;
const appInfoQueryKey = ["app-info"] as const;

const createMessage = (
  role: TranscriptMessage["role"],
  text: string,
  rawEvents: readonly RawEvent[],
): TranscriptMessage => ({
  id: crypto.randomUUID(),
  role,
  text,
  rawEvents,
});

const getPresetById = (presets: readonly AgentPreset[], presetId: string): AgentPreset | null => {
  return presets.find((preset) => preset.id === presetId) ?? null;
};

const transcriptForSession = (
  transcripts: SessionTranscriptMap,
  sessionId: string | null,
): readonly TranscriptMessage[] => {
  if (sessionId === null) {
    return [];
  }

  return transcripts[sessionId] ?? [];
};

const latestRawEvents = (messages: readonly TranscriptMessage[]): readonly RawEvent[] => {
  const assistantMessage = [...messages].reverse().find((message) => message.role === "assistant");

  return assistantMessage?.rawEvents ?? [];
};

const AgentPresetSummary: FC<{ readonly preset: AgentPreset }> = ({ preset }) => {
  return (
    <div className="rounded-2xl border border-border/60 bg-white/70 p-3 shadow-[0_12px_30px_rgb(15_23_42_/_0.06)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{preset.label}</p>
          <p className="text-xs text-muted-foreground">{preset.description}</p>
        </div>
        <Badge variant={preset.id === "custom" ? "outline" : "secondary"}>{preset.id}</Badge>
      </div>
    </div>
  );
};

const SessionBadge: FC<{
  readonly session: SessionSummary;
  readonly selected: boolean;
  readonly onSelect: (sessionId: string) => void;
}> = ({ session, selected, onSelect }) => {
  return (
    <button
      className={cn(
        "flex w-full flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition",
        selected
          ? "border-primary/70 bg-primary/10 shadow-[0_14px_25px_rgb(194_98_52_/_0.12)]"
          : "border-border/60 bg-white/75 hover:border-primary/40 hover:bg-white",
      )}
      onClick={() => {
        onSelect(session.sessionId);
      }}
      type="button"
    >
      <div className="flex w-full items-center justify-between gap-3">
        <span className="font-medium">{session.command}</span>
        <Badge variant={selected ? "default" : "outline"}>
          {session.currentModeId ?? "default"}
        </Badge>
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">{session.sessionId}</p>
    </button>
  );
};

const RawEventPanel: FC<{
  readonly icon: typeof Sparkles;
  readonly title: string;
  readonly description: string;
  readonly items: readonly string[];
}> = ({ icon: Icon, title, description, items }) => {
  return (
    <Card className="border-white/70 bg-white/80 shadow-[0_16px_40px_rgb(15_23_42_/_0.08)] backdrop-blur">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Icon className="size-4" />
          </span>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-52 rounded-2xl border border-border/60 bg-background/70">
          <div className="space-y-2 p-3">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだイベントはありません。</p>
            ) : (
              items.map((item) => (
                <pre
                  className="overflow-x-auto rounded-xl bg-stone-950/94 p-3 font-mono text-xs leading-5 text-stone-100"
                  key={item}
                >
                  {item}
                </pre>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

const ACPPlaygroundPage: FC = () => {
  const queryClient = useQueryClient();
  const appInfoQuery = useSuspenseQuery({
    queryKey: appInfoQueryKey,
    queryFn: fetchAppInfo,
  });
  const sessionsQuery = useSuspenseQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSessions,
  });

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState("codex");
  const [customCommand, setCustomCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [cwd, setCwd] = useState("");
  const [prompt, setPrompt] = useState("");
  const [transcripts, setTranscripts] = useState<SessionTranscriptMap>({});

  const sessions = sessionsQuery.data?.sessions ?? [];
  const selectedSession =
    sessions.find((session) => session.sessionId === selectedSessionId) ?? sessions[0] ?? null;
  const selectedTranscript = transcriptForSession(transcripts, selectedSession?.sessionId ?? null);
  const deferredTranscript = useDeferredValue(selectedTranscript);
  const latestEvents = latestRawEvents(deferredTranscript);

  const createSessionMutation = useMutation({
    mutationFn: createSessionRequest,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      startTransition(() => {
        setSelectedSessionId(response.session.sessionId);
      });
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({
      sessionId,
      modeId,
      modelId,
    }: {
      readonly sessionId: string;
      readonly modeId?: string | null;
      readonly modelId?: string | null;
    }) => updateSessionRequest(sessionId, { modeId, modelId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: deleteSessionRequest,
    onSuccess: async (_, sessionId) => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      startTransition(() => {
        setTranscripts((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => key !== sessionId)),
        );
        setSelectedSessionId((current) => (current === sessionId ? null : current));
      });
    },
  });

  const sendPromptMutation = useMutation({
    mutationFn: ({
      sessionId,
      nextPrompt,
    }: {
      readonly sessionId: string;
      readonly nextPrompt: string;
    }) => sendPromptRequest(sessionId, { prompt: nextPrompt, attachmentIds: [] }),
  });

  const handlePresetChange = (presetId: string | null) => {
    if (presetId === null) {
      return;
    }

    setSelectedPresetId(presetId);

    const presets = appInfoQuery.data?.agentPresets ?? [];
    const preset = getPresetById(presets, presetId);
    if (preset === null || preset.id === "custom") {
      return;
    }

    setCustomCommand(preset.command);
    setArgsText(preset.args.join("\n"));
  };

  const handleCreateSession = async () => {
    await createSessionMutation.mutateAsync({
      projectId: null,
      presetId: selectedPresetId,
      command: selectedPresetId === "custom" ? customCommand : null,
      argsText,
      cwd: cwd.length > 0 ? cwd : null,
    });
  };

  const handleSendPrompt = async () => {
    if (selectedSession === null || prompt.trim().length === 0) {
      return;
    }

    const currentPrompt = prompt;
    setPrompt("");
    setTranscripts((current) => ({
      ...current,
      [selectedSession.sessionId]: [
        ...(current[selectedSession.sessionId] ?? []),
        createMessage("user", currentPrompt, []),
      ],
    }));

    try {
      const response = await sendPromptMutation.mutateAsync({
        sessionId: selectedSession.sessionId,
        nextPrompt: currentPrompt,
      });

      setTranscripts((current) => ({
        ...current,
        [selectedSession.sessionId]: [
          ...(current[selectedSession.sessionId] ?? []),
          createMessage("assistant", response.text, response.rawEvents),
        ],
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Prompt failed unexpectedly.";

      setTranscripts((current) => ({
        ...current,
        [selectedSession.sessionId]: [
          ...(current[selectedSession.sessionId] ?? []),
          createMessage("assistant", `Error: ${message}`, []),
        ],
      }));
    }
  };

  const info = appInfoQuery.data;

  const planItems = latestEvents
    .filter((event) => event.type === "plan")
    .flatMap((event) => event.entries);
  const diffItems = latestEvents
    .filter((event) => event.type === "diff")
    .map(
      (event) => `${event.path}\n--- old\n${event.oldText ?? ""}\n--- new\n${event.newText ?? ""}`,
    );
  const terminalItems = latestEvents
    .filter((event) => event.type === "terminal")
    .map((event) => event.text);

  return (
    <div className="relative overflow-hidden px-4 py-6 md:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(194,98,52,0.18),transparent_55%)]" />
      <div className="relative mx-auto max-w-[1560px] space-y-6">
        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,rgba(255,252,247,0.98),rgba(255,244,229,0.92))] shadow-[0_24px_80px_rgb(84_52_35_/_0.12)]">
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em]">
                  Web Stack × ACP
                </Badge>
                <Badge variant="outline">Private playground</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr] md:items-end">
                <div className="space-y-3">
                  <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    arbitrary agent control from a browser
                  </p>
                  <h1 className="max-w-3xl font-serif text-5xl leading-none tracking-tight text-stone-900 md:text-7xl">
                    ACP を<span className="text-primary"> SPA の運転席 </span>
                    まで引きずり出す。
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-stone-700 md:text-base">
                    Hono が ACP セッションを保持し、TanStack SPA が会話、 mode/model
                    切替、plan/diff/terminal の観測を担当します。 ローカル Agent
                    をブラウザから直接起動するのではなく、 Web stack 全体として ACP
                    を使う検証台です。
                  </p>
                </div>
                <div className="grid gap-3">
                  <div className="rounded-[28px] border border-stone-900/10 bg-stone-950 p-4 text-stone-100 shadow-[0_20px_40px_rgb(15_23_42_/_0.2)]">
                    <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-stone-400">
                      <SplitSquareVertical className="size-4" />
                      session bridge
                    </div>
                    <div className="mt-3 space-y-2 font-mono text-xs">
                      <p>browser → hono → acp provider</p>
                      <p>→ agent process → structured events</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-3xl border border-border/60 bg-white/80 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        sessions
                      </p>
                      <p className="mt-2 text-3xl font-semibold">{sessions.length}</p>
                    </div>
                    <div className="rounded-3xl border border-border/60 bg-white/80 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        presets
                      </p>
                      <p className="mt-2 text-3xl font-semibold">
                        {info?.agentPresets.length ?? 0}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card className="border-dashed border-primary/25 bg-white/75 shadow-[0_18px_50px_rgb(15_23_42_/_0.08)] backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScanSearch className="size-4" />
                Available presets
              </CardTitle>
              <CardDescription>
                ドキュメント済みのコマンドを並べつつ、最後に custom command を置いて任意 Agent
                を試せます。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {(info?.agentPresets ?? []).map((preset) => (
                <AgentPresetSummary key={preset.id} preset={preset} />
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
          <Card className="border-white/70 bg-white/82 shadow-[0_16px_40px_rgb(15_23_42_/_0.08)] backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranchPlus className="size-4" />
                Session launcher
              </CardTitle>
              <CardDescription>
                preset 選択後に必要なら command / args / cwd を調整して ACP セッションを作成します。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Preset</p>
                <Select onValueChange={handlePresetChange} value={selectedPresetId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(info?.agentPresets ?? []).map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Command</p>
                <Input
                  onChange={(event) => {
                    setCustomCommand(event.target.value);
                  }}
                  placeholder="claude-code-acp"
                  value={customCommand}
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Args (one per line)
                </p>
                <Textarea
                  className="min-h-28"
                  onChange={(event) => {
                    setArgsText(event.target.value);
                  }}
                  placeholder="--experimental-acp"
                  value={argsText}
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Working directory
                </p>
                <Input
                  onChange={(event) => {
                    setCwd(event.target.value);
                  }}
                  placeholder={info?.workingDirectory ?? "/path/to/project"}
                  value={cwd}
                />
              </div>

              <Button
                className="w-full"
                disabled={createSessionMutation.isPending}
                onClick={() => {
                  void handleCreateSession();
                }}
                type="button"
              >
                <Sparkles className="size-4" />
                {createSessionMutation.isPending ? "Creating session..." : "Create ACP session"}
              </Button>

              {createSessionMutation.error instanceof Error ? (
                <p className="text-sm text-destructive">{createSessionMutation.error.message}</p>
              ) : null}

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Live sessions
                  </p>
                  <Badge variant="outline">{sessions.length}</Badge>
                </div>
                <div className="space-y-2">
                  {sessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">まだセッションはありません。</p>
                  ) : (
                    sessions.map((session) => (
                      <SessionBadge
                        key={session.sessionId}
                        onSelect={(sessionId) => {
                          setSelectedSessionId(sessionId);
                        }}
                        selected={session.sessionId === selectedSession?.sessionId}
                        session={session}
                      />
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/70 bg-white/80 shadow-[0_20px_50px_rgb(15_23_42_/_0.09)] backdrop-blur">
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquareText className="size-4" />
                    Chat console
                  </CardTitle>
                  <CardDescription>
                    prompt を送り、返答と ACP session の状態を見ます。
                  </CardDescription>
                </div>
                {selectedSession === null ? (
                  <Badge variant="outline">No session</Badge>
                ) : (
                  <Badge>{selectedSession.currentModelId ?? "session ready"}</Badge>
                )}
              </div>

              {selectedSession === null ? null : (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Mode
                    </p>
                    <Select
                      onValueChange={(value) => {
                        void updateSessionMutation.mutateAsync({
                          sessionId: selectedSession.sessionId,
                          modeId: value,
                        });
                      }}
                      value={selectedSession.currentModeId ?? undefined}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedSession.availableModes.map((mode) => (
                          <SelectItem key={mode.id} value={mode.id}>
                            {mode.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Model
                    </p>
                    <Select
                      onValueChange={(value) => {
                        void updateSessionMutation.mutateAsync({
                          sessionId: selectedSession.sessionId,
                          modelId: value,
                        });
                      }}
                      value={selectedSession.currentModelId ?? undefined}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedSession.availableModels.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Session
                    </p>
                    <Button
                      className="w-full"
                      disabled={deleteSessionMutation.isPending}
                      onClick={() => {
                        if (selectedSession !== null) {
                          void deleteSessionMutation.mutateAsync(selectedSession.sessionId);
                        }
                      }}
                      type="button"
                      variant="outline"
                    >
                      Close current session
                    </Button>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="h-[430px] rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(247,240,231,0.9))]">
                <div className="space-y-4 p-4">
                  {deferredTranscript.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-border/70 bg-white/65 p-6 text-center text-sm text-muted-foreground">
                      Session を作成して prompt を送ると、ここに transcript がたまります。
                    </div>
                  ) : (
                    deferredTranscript.map((message) => (
                      <div
                        className={cn(
                          "max-w-[85%] rounded-[28px] px-4 py-3 shadow-[0_10px_30px_rgb(15_23_42_/_0.06)]",
                          message.role === "user"
                            ? "ml-auto bg-primary text-primary-foreground"
                            : "border border-border/60 bg-white text-foreground",
                        )}
                        key={message.id}
                      >
                        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] opacity-70">
                          {message.role === "user" ? (
                            <Bot className="size-3.5" />
                          ) : (
                            <MessageSquareText className="size-3.5" />
                          )}
                          {message.role}
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              <div className="rounded-[30px] border border-stone-950/10 bg-stone-950 p-4 text-stone-50 shadow-[0_18px_40px_rgb(15_23_42_/_0.16)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FolderRoot className="size-4 text-primary-foreground/80" />
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-stone-400">
                      prompt dock
                    </p>
                  </div>
                  {selectedSession !== null ? (
                    <Badge variant="secondary">{selectedSession.command}</Badge>
                  ) : null}
                </div>
                <Textarea
                  className="min-h-28 border-stone-700/80 bg-stone-900 text-stone-50 placeholder:text-stone-500"
                  onChange={(event) => {
                    setPrompt(event.target.value);
                  }}
                  placeholder="Ask the current ACP session to inspect, edit, or plan."
                  value={prompt}
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-stone-400">
                    API returns the assistant text together with normalized raw ACP events.
                  </p>
                  <Button
                    disabled={selectedSession === null || sendPromptMutation.isPending}
                    onClick={() => {
                      void handleSendPrompt();
                    }}
                    type="button"
                    variant="secondary"
                  >
                    {sendPromptMutation.isPending ? "Running..." : "Send prompt"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <RawEventPanel
              description="Agent が返した plan entries を整形して表示します。"
              icon={Sparkles}
              items={planItems}
              title="Plan"
            />
            <RawEventPanel
              description="ACP の diff raw event を path / old / new で展開します。"
              icon={SplitSquareVertical}
              items={diffItems}
              title="Diff"
            />
            <RawEventPanel
              description="terminal event の出力をそのまま追います。"
              icon={TerminalSquare}
              items={terminalItems}
              title="Terminal"
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/debug")({
  component: ACPPlaygroundPage,
});
