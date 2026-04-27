import { describe, expect, test } from "vitest";

import { inspectResumeCapabilities, mapResumableSessionCandidates } from "./session-resume.pure.ts";

describe("inspectResumeCapabilities", () => {
  test("reports ready when loadSession and session/list are available", () => {
    expect(
      inspectResumeCapabilities({
        loadSession: true,
        mcpCapabilities: { http: false, sse: false },
        promptCapabilities: { audio: false, embeddedContext: false, image: false },
        sessionCapabilities: {
          list: {},
          resume: null,
        },
      }),
    ).toEqual({
      loadSession: true,
      listSessions: true,
      resumeSession: false,
      canLoadIntoProvider: true,
      fallbackReason: null,
    });
  });

  test("reports a safe fallback when only session/resume is available", () => {
    expect(
      inspectResumeCapabilities({
        loadSession: false,
        mcpCapabilities: { http: false, sse: false },
        promptCapabilities: { audio: false, embeddedContext: false, image: false },
        sessionCapabilities: {
          list: null,
          resume: {},
        },
      }),
    ).toEqual({
      loadSession: false,
      listSessions: false,
      resumeSession: true,
      canLoadIntoProvider: false,
      fallbackReason:
        "Agent advertises session/resume only. This PoC requires loadSession to bind an existing session to the current AI SDK provider.",
    });
  });

  test("reports a safe fallback when sessions can be listed but not loaded", () => {
    expect(
      inspectResumeCapabilities({
        loadSession: false,
        mcpCapabilities: { http: false, sse: false },
        promptCapabilities: { audio: false, embeddedContext: false, image: false },
        sessionCapabilities: {
          list: {},
          resume: null,
        },
      }),
    ).toEqual({
      loadSession: false,
      listSessions: true,
      resumeSession: false,
      canLoadIntoProvider: false,
      fallbackReason:
        "Agent can list sessions but does not advertise loadSession. This PoC cannot import the listed sessions safely.",
    });
  });

  test("does not treat missing session capabilities as supported", () => {
    expect(
      inspectResumeCapabilities({
        loadSession: false,
        mcpCapabilities: { http: false, sse: false },
        promptCapabilities: { audio: false, embeddedContext: false, image: false },
      }),
    ).toEqual({
      loadSession: false,
      listSessions: false,
      resumeSession: false,
      canLoadIntoProvider: false,
      fallbackReason: "Agent does not advertise loadSession, session/list, or session/resume.",
    });
  });
});

describe("mapResumableSessionCandidates", () => {
  test("marks candidates as non-loadable when the provider cannot bind them safely", () => {
    expect(
      mapResumableSessionCandidates(
        [
          {
            cwd: "/tmp/project",
            sessionId: "session-1",
            title: "Existing session",
            updatedAt: "2026-04-27T00:00:00.000Z",
          },
        ],
        {
          loadSession: false,
          listSessions: true,
          resumeSession: true,
          canLoadIntoProvider: false,
          fallbackReason: "fallback",
        },
      ),
    ).toEqual([
      {
        sessionId: "session-1",
        cwd: "/tmp/project",
        title: "Existing session",
        updatedAt: "2026-04-27T00:00:00.000Z",
        loadable: false,
      },
    ]);
  });
});
