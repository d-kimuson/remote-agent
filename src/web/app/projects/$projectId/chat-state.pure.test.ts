import { describe, expect, test } from "vitest";

import type { AgentPreset, SessionSummary } from "../../../../shared/acp.ts";
import {
  appendTranscriptMessage,
  buildDraftSession,
  buildPromptText,
  buildSessionEntries,
  defaultPresetId,
  moveTranscript,
  resolveSelectedSessionId,
  resolveSessionListTitle,
} from "./chat-state.pure.ts";
import { createChatMessage } from "./types.ts";

const presets = [
  {
    id: "other",
    label: "Other",
    description: "fallback preset",
    command: "other-agent",
    args: [],
  },
  {
    id: "codex",
    label: "Codex",
    description: "preferred preset",
    command: "codex",
    args: [],
  },
] satisfies readonly AgentPreset[];

const session = {
  sessionId: "session-1",
  origin: "new",
  status: "paused",
  projectId: "project-1",
  presetId: "codex",
  command: "codex",
  args: [],
  cwd: "/tmp/project",
  createdAt: "2026-04-27T12:00:00.000Z",
  isActive: true,
  title: null,
  firstUserMessagePreview: null,
  updatedAt: null,
  currentModeId: null,
  currentModelId: null,
  availableModes: [],
  availableModels: [],
} satisfies SessionSummary;

describe("chat-state.pure", () => {
  test("resolveSessionListTitle prefers title then preview then transcript", () => {
    expect(
      resolveSessionListTitle(
        { ...session, title: "  Named  ", firstUserMessagePreview: "ignored" },
        "transcript",
      ),
    ).toBe("Named");
    expect(
      resolveSessionListTitle(
        { ...session, title: null, firstUserMessagePreview: "  hello world  " },
        null,
      ),
    ).toBe("hello world");
    expect(
      resolveSessionListTitle({ ...session, title: null, firstUserMessagePreview: null }, "hi"),
    ).toBe("hi");
    expect(
      resolveSessionListTitle(
        { ...session, title: null, firstUserMessagePreview: null, presetId: "codex" },
        null,
      ),
    ).toBe("codex");
  });

  test("defaultPresetId prefers codex", () => {
    expect(defaultPresetId(presets)).toBe("codex");
  });

  test("buildDraftSession falls back to first preset metadata", () => {
    expect(
      buildDraftSession({
        cwd: "/tmp/project",
        presetId: "",
        presets,
      }),
    ).toEqual({
      presetId: "other",
      label: "Other",
      command: "other-agent",
      cwd: "/tmp/project",
    });
  });

  test("resolveSelectedSessionId falls back to the first persisted session", () => {
    expect(resolveSelectedSessionId([session], "missing")).toBe("session-1");
    expect(resolveSelectedSessionId([], "missing")).toBeNull();
  });

  test("buildSessionEntries always prepends the draft session", () => {
    const draftSession = {
      presetId: "codex",
      label: "Codex",
      command: "codex",
      cwd: "/tmp/project",
    };

    expect(
      buildSessionEntries({
        draftSession,
        sessions: [session],
      }).map((entry) => entry.kind),
    ).toEqual(["draft", "existing"]);

    expect(
      buildSessionEntries({
        draftSession,
        sessions: [],
      }).map((entry) => entry.kind),
    ).toEqual(["draft"]);
  });

  test("buildPromptText trims prompt and appends attachments", () => {
    expect(buildPromptText("  hello  ", ["a.ts", "b.ts"])).toBe(
      "hello\n\nAttached files:\n- a.ts\n- b.ts",
    );
    expect(buildPromptText("   ", ["a.ts"])).toBe("");
  });

  test("appendTranscriptMessage and moveTranscript preserve message order", () => {
    const userMessage = createChatMessage("user", "hello");
    const assistantMessage = createChatMessage("assistant", "world");

    const appended = appendTranscriptMessage({
      message: userMessage,
      transcriptKey: "draft",
      transcripts: {},
    });
    const moved = moveTranscript({
      from: "draft",
      to: "session-1",
      transcripts: appendTranscriptMessage({
        message: assistantMessage,
        transcriptKey: "draft",
        transcripts: appended,
      }),
    });

    expect(moved["draft"]).toBeUndefined();
    expect(moved["session-1"]?.map((message) => message.text)).toEqual(["hello", "world"]);
  });
});
