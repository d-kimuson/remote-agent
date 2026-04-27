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
