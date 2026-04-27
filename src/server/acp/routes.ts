import { Hono } from "hono";
import { describeRoute, validator as vValidator } from "hono-openapi";
import { boolean, object, parse } from "valibot";

import {
  createSessionRequestSchema,
  messageResponseSchema,
  sendMessageRequestSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  updateSessionRequestSchema,
  type CreateSessionRequest,
} from "../../shared/acp.ts";
import { errorResponseSchema, jsonResponse, validationErrorHook } from "../hono-utils.ts";
import { getProject } from "../project-store.ts";
import { parseArgsText } from "./args.pure.ts";
import { agentPresets } from "./presets.ts";
import {
  createSession,
  listSessions,
  removeSession,
  sendPrompt,
  updateSession,
} from "./session-store.ts";

const deleteSessionResponseSchema = object({
  ok: boolean(),
});

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

export const acpRoutes = new Hono()
  .get(
    "/sessions",
    describeRoute({
      summary: "List ACP sessions",
      responses: { 200: jsonResponse("ACP sessions", sessionsResponseSchema) },
    }),
    (c) => {
      const response = parse(sessionsResponseSchema, { sessions: listSessions() });
      return c.json(response);
    },
  )
  .post(
    "/sessions",
    describeRoute({
      summary: "Create ACP session",
      responses: {
        201: jsonResponse("Created ACP session", sessionResponseSchema),
        400: jsonResponse("ACP session creation error", errorResponseSchema),
      },
    }),
    vValidator("json", createSessionRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const request = c.req.valid("json");
        const resolved = resolveAgentCommand(request);
        const project =
          request.projectId === null || request.projectId === undefined
            ? null
            : await getProject(request.projectId);
        const cwd = request.cwd ?? project?.workingDirectory ?? process.cwd();
        const preset = findPreset(resolved.presetId);
        const session = await createSession({
          projectId: project?.id ?? null,
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
    },
  )
  .patch(
    "/sessions/:sessionId",
    describeRoute({
      summary: "Update ACP session",
      responses: {
        200: jsonResponse("Updated ACP session", sessionResponseSchema),
        400: jsonResponse("ACP session update error", errorResponseSchema),
      },
    }),
    vValidator("json", updateSessionRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const request = c.req.valid("json");
        const sessionId = c.req.param("sessionId");
        const session = await updateSession(sessionId, request);
        const response = parse(sessionResponseSchema, { session });
        return c.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to update session";
        return c.json({ error: message }, 400);
      }
    },
  )
  .post(
    "/sessions/:sessionId/messages",
    describeRoute({
      summary: "Send message to ACP session",
      responses: {
        200: jsonResponse("ACP message response", messageResponseSchema),
        400: jsonResponse("ACP message error", errorResponseSchema),
      },
    }),
    vValidator("json", sendMessageRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const request = c.req.valid("json");
        const sessionId = c.req.param("sessionId");
        const response = parse(messageResponseSchema, await sendPrompt(sessionId, request.prompt));
        return c.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to send prompt";
        return c.json({ error: message }, 400);
      }
    },
  )
  .delete(
    "/sessions/:sessionId",
    describeRoute({
      summary: "Delete ACP session",
      responses: { 200: jsonResponse("Delete result", deleteSessionResponseSchema) },
    }),
    (c) => {
      const removed = removeSession(c.req.param("sessionId"));
      return c.json({ ok: removed });
    },
  );
