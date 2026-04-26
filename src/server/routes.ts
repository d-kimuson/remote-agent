import { Hono } from "hono";
import { parse } from "valibot";

import {
  appInfoSchema,
  createSessionRequestSchema,
  messageResponseSchema,
  sendMessageRequestSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  type CreateSessionRequest,
  updateSessionRequestSchema,
} from "@/shared/acp";
import { parseArgsText } from "@/server/acp/args.pure";
import { agentPresets } from "@/server/acp/presets";
import {
  createSession,
  listSessions,
  removeSession,
  sendPrompt,
  updateSession,
} from "@/server/acp/session-store";

const readJsonBody = async (request: Request): Promise<unknown> => {
  const bodyText = await request.text();
  if (bodyText.length === 0) {
    return {};
  }

  const parsedBody: unknown = JSON.parse(bodyText);
  return parsedBody;
};

const findPreset = (presetId: string | null | undefined) => {
  if (presetId === null || presetId === undefined) {
    return null;
  }

  return agentPresets.find((preset) => preset.id === presetId) ?? null;
};

const resolveAgentCommand = (
  request: CreateSessionRequest,
): {
  readonly presetId: string | null;
  readonly command: string;
  readonly args: readonly string[];
} => {
  const preset = findPreset(request.presetId);
  const parsedArgs = parseArgsText(request.argsText);

  if (preset !== null && preset.id !== "custom") {
    return {
      presetId: preset.id,
      command: preset.command,
      args: parsedArgs.length > 0 ? parsedArgs : preset.args,
    };
  }

  if (request.command === null || request.command === undefined) {
    throw new Error("command is required when using a custom agent");
  }

  return {
    presetId: preset?.id ?? "custom",
    command: request.command,
    args: parsedArgs,
  };
};

export const routes = new Hono()
  .get("/info", (c) => {
    const response = parse(appInfoSchema, {
      appName: "ACP Playground",
      workingDirectory: process.cwd(),
      agentPresets,
    });

    return c.json(response);
  })
  .get("/acp/sessions", (c) => {
    const response = parse(sessionsResponseSchema, {
      sessions: listSessions(),
    });

    return c.json(response);
  })
  .post("/acp/sessions", async (c) => {
    try {
      const body = await readJsonBody(c.req.raw);
      const request = parse(createSessionRequestSchema, body);
      const resolved = resolveAgentCommand(request);
      const cwd = request.cwd ?? process.cwd();
      const preset = findPreset(resolved.presetId);
      const session = await createSession({
        preset,
        command: resolved.command,
        args: resolved.args,
        cwd,
      });
      const response = parse(sessionResponseSchema, { session });

      return c.json(response, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to create session";
      return c.json({ error: message }, 400);
    }
  })
  .patch("/acp/sessions/:sessionId", async (c) => {
    try {
      const body = await readJsonBody(c.req.raw);
      const request = parse(updateSessionRequestSchema, body);
      const sessionId = c.req.param("sessionId");
      const session = await updateSession(sessionId, request);
      const response = parse(sessionResponseSchema, { session });

      return c.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to update session";
      return c.json({ error: message }, 400);
    }
  })
  .post("/acp/sessions/:sessionId/messages", async (c) => {
    try {
      const body = await readJsonBody(c.req.raw);
      const request = parse(sendMessageRequestSchema, body);
      const sessionId = c.req.param("sessionId");
      const response = parse(messageResponseSchema, await sendPrompt(sessionId, request.prompt));

      return c.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to send prompt";
      return c.json({ error: message }, 400);
    }
  })
  .delete("/acp/sessions/:sessionId", (c) => {
    const removed = removeSession(c.req.param("sessionId"));

    return c.json({ ok: removed });
  });

export type RouteType = typeof routes;
