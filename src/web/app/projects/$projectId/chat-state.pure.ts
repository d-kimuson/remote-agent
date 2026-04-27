import type { AgentPreset, SessionSummary } from "../../../../shared/acp.ts";
import type { ChatMessage, TranscriptMap } from "./types.ts";

export const draftSessionTranscriptKey = "draft-session";

export type DraftSession = {
  readonly presetId: string;
  readonly label: string;
  readonly command: string;
  readonly cwd: string;
};

export type SessionListEntry =
  | {
      readonly kind: "draft";
      readonly draft: DraftSession;
    }
  | {
      readonly kind: "existing";
      readonly session: SessionSummary;
    };

export const defaultPresetId = (presets: readonly AgentPreset[]): string => {
  const codexPreset = presets.find((preset) => preset.id === "codex");
  return codexPreset?.id ?? presets[0]?.id ?? "";
};

export const buildDraftSession = ({
  cwd,
  presetId,
  presets,
}: {
  readonly cwd: string;
  readonly presetId: string;
  readonly presets: readonly AgentPreset[];
}): DraftSession => {
  const preset = presets.find((entry) => entry.id === presetId) ?? presets[0] ?? null;

  return {
    presetId: preset?.id ?? presetId,
    label: preset?.label ?? presetId,
    command: preset?.command ?? "agent",
    cwd,
  };
};

export const resolveSelectedSessionId = (
  sessions: readonly SessionSummary[],
  selectedSessionId: string | null,
): string | null => {
  if (
    selectedSessionId !== null &&
    sessions.some((session) => session.sessionId === selectedSessionId)
  ) {
    return selectedSessionId;
  }

  return sessions[0]?.sessionId ?? null;
};

export const buildSessionEntries = ({
  draftSession,
  sessions,
}: {
  readonly draftSession: DraftSession;
  readonly sessions: readonly SessionSummary[];
}): readonly SessionListEntry[] => {
  const persistedEntries = sessions.map<SessionListEntry>((session) => ({
    kind: "existing",
    session,
  }));

  return [{ kind: "draft", draft: draftSession }, ...persistedEntries];
};

const truncateOneLine = (value: string, maxChars: number): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return "";
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 1)}…`;
};

/** サーバーの title、一覧用の先頭 user メッセージ、ローカル transcript の順で採用 */
export const resolveSessionListTitle = (
  session: SessionSummary,
  firstUserTextFromTranscript: string | null | undefined,
  options: { readonly maxChars?: number } = {},
): string => {
  const maxChars = options.maxChars ?? 120;
  const fromTitle = session.title?.trim();
  if (fromTitle !== undefined && fromTitle.length > 0) {
    return truncateOneLine(fromTitle, maxChars);
  }
  const fromListPreview = session.firstUserMessagePreview?.trim();
  if (fromListPreview !== undefined && fromListPreview.length > 0) {
    return truncateOneLine(fromListPreview, maxChars);
  }
  const fromTranscript = firstUserTextFromTranscript?.trim();
  if (fromTranscript !== undefined && fromTranscript.length > 0) {
    return truncateOneLine(fromTranscript, maxChars);
  }
  return session.presetId ?? "Session";
};

export const buildPromptText = (prompt: string, attachedFiles: readonly string[]): string => {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.length === 0) {
    return "";
  }

  const attachmentBlock =
    attachedFiles.length === 0
      ? ""
      : `\n\nAttached files:\n${attachedFiles.map((path) => `- ${path}`).join("\n")}`;

  return `${trimmedPrompt}${attachmentBlock}`;
};

export const appendTranscriptMessage = ({
  message,
  transcriptKey,
  transcripts,
}: {
  readonly message: ChatMessage;
  readonly transcriptKey: string;
  readonly transcripts: TranscriptMap;
}): TranscriptMap => ({
  ...transcripts,
  [transcriptKey]: [...(transcripts[transcriptKey] ?? []), message],
});

export const moveTranscript = ({
  from,
  to,
  transcripts,
}: {
  readonly from: string;
  readonly to: string;
  readonly transcripts: TranscriptMap;
}): TranscriptMap => {
  if (from === to) {
    return transcripts;
  }

  const sourceTranscript = transcripts[from] ?? [];
  if (sourceTranscript.length === 0) {
    return transcripts;
  }

  const targetTranscript = transcripts[to] ?? [];
  const nextTranscripts = { ...transcripts, [to]: [...targetTranscript, ...sourceTranscript] };
  delete nextTranscripts[from];
  return nextTranscripts;
};
