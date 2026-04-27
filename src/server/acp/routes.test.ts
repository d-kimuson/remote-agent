import { describe, expect, test } from "vitest";

import { honoApp } from "../app.ts";

describe("acpRoutes", () => {
  test("exposes only the Codex preset in app info", async () => {
    const response = await honoApp.request("/api/info");
    const payload: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      agentPresets: [
        {
          id: "codex",
          label: "Codex",
        },
      ],
    });
  });

  test("returns 404 for unknown project on agent model catalog", async () => {
    const response = await honoApp.request(
      "/api/acp/agent/model-catalog?projectId=__no_such_project__&presetId=codex",
    );
    const payload: unknown = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({
      error: "Unknown project: __no_such_project__",
    });
  });

  test("exposes ACP session SSE with event-stream content type", async () => {
    const ac = new AbortController();
    setTimeout(() => {
      ac.abort();
    }, 0);
    const response = await honoApp.request("/api/acp/sse", { signal: ac.signal });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });

  test("rejects session creation requests for non-Codex presets", async () => {
    const response = await honoApp.request("/api/acp/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: null,
        presetId: "pi",
        command: null,
        argsText: "",
        cwd: null,
      }),
    });
    const payload: unknown = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: "Only the Codex preset is currently supported.",
    });
  });
});
