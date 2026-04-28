import { describe, expect, test } from "vitest";

import type { SessionSummary } from "../../../../shared/acp.ts";
import { filterSessionsByQuery, sortSessionsNewestFirst } from "./project-session-list.pure.ts";

const session = {
  sessionId: "session-1",
  origin: "new",
  status: "paused",
  projectId: "project-1",
  presetId: "codex",
  command: "codex",
  args: [],
  cwd: "/tmp/acp-playground",
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

describe("project-session-list.pure", () => {
  test("filterSessionsByQuery searches session title, preview, cwd, and ids", () => {
    const sessions = [
      { ...session, sessionId: "alpha", title: "Release notes" },
      { ...session, sessionId: "beta", firstUserMessagePreview: "Fix mobile menu" },
    ] satisfies readonly SessionSummary[];

    expect(filterSessionsByQuery({ sessions, query: "mobile" }).map((s) => s.sessionId)).toEqual([
      "beta",
    ]);
    expect(
      filterSessionsByQuery({ sessions, query: "ACP-PLAYGROUND" }).map((s) => s.sessionId),
    ).toEqual(["alpha", "beta"]);
    expect(filterSessionsByQuery({ sessions, query: " " }).map((s) => s.sessionId)).toEqual([
      "alpha",
      "beta",
    ]);
  });

  test("sortSessionsNewestFirst prefers updatedAt", () => {
    const sessions = [
      { ...session, sessionId: "old", createdAt: "2026-04-27T12:00:00.000Z" },
      {
        ...session,
        sessionId: "updated",
        createdAt: "2026-04-20T12:00:00.000Z",
        updatedAt: "2026-04-28T12:00:00.000Z",
      },
      { ...session, sessionId: "new", createdAt: "2026-04-28T10:00:00.000Z" },
    ] satisfies readonly SessionSummary[];

    expect(sortSessionsNewestFirst(sessions).map((s) => s.sessionId)).toEqual([
      "updated",
      "new",
      "old",
    ]);
  });
});
