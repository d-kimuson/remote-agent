import { Hono } from "hono";
import { describeRoute, validator as vValidator } from "hono-openapi";
import { boolean, object, parse } from "valibot";

import {
  agentModelCatalogQuerySchema,
  agentModelCatalogResponseSchema,
  createSessionRequestSchema,
  discoverResumableSessionsRequestSchema,
  loadSessionRequestSchema,
  messageResponseSchema,
  resumableSessionsResponseSchema,
  sendMessageRequestSchema,
  sessionMessagesResponseSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  updateSessionRequestSchema,
  type CreateSessionRequest,
  type DiscoverResumableSessionsRequest,
} from "../../shared/acp.ts";
import { errorResponseSchema, jsonResponse, validationErrorHook } from "../hono-utils.ts";
import { getProject } from "../project-store.ts";
import { discoverResumableSessions } from "./agent-session-client.ts";
import { parseArgsText } from "./args.pure.ts";
import { probeAgentModelCatalog } from "./probe-agent-catalog.ts";
import { agentPresets } from "./presets.ts";
import {
  createSession,
  loadSession,
  listSessionMessages,
  listSessions,
  removeSession,
  sendPrompt,
  updateSession,
} from "./session-store.ts";
import { subscribeAcpSse } from "./sse-broadcast.ts";

const deleteSessionResponseSchema = object({
  ok: boolean(),
});

const findPreset = (presetId: string | null | undefined) => {
  if (presetId === null || presetId === undefined || presetId === "codex") {
    return agentPresets[0] ?? null;
  }

  return null;
};

const resolveAgentCommand = (
  request: CreateSessionRequest,
): {
  readonly presetId: string | null;
  readonly command: string;
  readonly args: readonly string[];
} => {
  const preset = findPreset(request.presetId ?? "codex");
  const parsedArgs = parseArgsText(request.argsText);

  if (preset === null) {
    throw new Error("Only the Codex preset is currently supported.");
  }

  if (request.command !== null && request.command !== undefined) {
    throw new Error("Custom ACP commands are temporarily disabled. Use the Codex preset.");
  }

  return {
    presetId: preset.id,
    command: preset.command,
    args: parsedArgs.length > 0 ? parsedArgs : preset.args,
  };
};

const resolveProjectContext = async ({
  projectId,
  cwd,
}: {
  readonly projectId: string | null | undefined;
  readonly cwd: string | null | undefined;
}) => {
  const project =
    projectId === null || projectId === undefined ? null : await getProject(projectId);

  return {
    project,
    cwd: cwd ?? project?.workingDirectory ?? process.cwd(),
  };
};

const resolveCodexPreset = (presetId: string | null | undefined) => {
  const preset = findPreset(presetId ?? "codex");

  if (preset?.id !== "codex") {
    throw new Error("Existing session load PoC is currently limited to the Codex preset.");
  }

  return preset;
};

const resolveCodexResumeCommand = (presetId: string | null | undefined) => {
  const preset = resolveCodexPreset(presetId);

  return {
    preset,
    command: preset.command,
    args: preset.args,
  };
};

export const acpRoutes = new Hono()
  .get(
    "/sse",
    describeRoute({
      summary: "Subscribe to ACP session updates (Server-Sent Events, JSON in each data line)",
      responses: { 200: { description: "Event stream" } },
    }),
    (c) => {
      const stream = new TransformStream<Uint8Array, Uint8Array>();
      const writer = stream.writable.getWriter();
      const encoder = new TextEncoder();
      const write = (chunk: string) => {
        return writer.write(encoder.encode(chunk));
      };
      const unsubscribe = subscribeAcpSse((line) => {
        void write(`data: ${line}\n\n`);
      });
      const close = () => {
        unsubscribe();
        return writer.close().catch(() => undefined);
      };
      c.req.raw.signal.addEventListener("abort", () => {
        void close();
      });
      return c.newResponse(stream.readable, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    },
  )
  .get(
    "/agent/model-catalog",
    describeRoute({
      summary: "Probe agent for model and mode list (ephemeral initSession)",
      responses: {
        200: jsonResponse("Model/mode options", agentModelCatalogResponseSchema),
        400: jsonResponse("Model catalog error", errorResponseSchema),
        404: jsonResponse("Project not found", errorResponseSchema),
      },
    }),
    vValidator("query", agentModelCatalogQuerySchema, validationErrorHook),
    async (c) => {
      const request = c.req.valid("query");
      let project;
      try {
        project = await getProject(request.projectId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown project";
        if (message.startsWith("Unknown project:")) {
          return c.json({ error: message }, 404);
        }
        return c.json({ error: message }, 500);
      }

      try {
        const raw = await probeAgentModelCatalog({
          cwd: project.workingDirectory,
          presetId: request.presetId,
        });
        return c.json(parse(agentModelCatalogResponseSchema, raw));
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to probe model catalog";
        return c.json({ error: message }, 400);
      }
    },
  )
  .get(
    "/sessions",
    describeRoute({
      summary: "List ACP sessions",
      responses: { 200: jsonResponse("ACP sessions", sessionsResponseSchema) },
    }),
    async (c) => {
      const response = parse(sessionsResponseSchema, { sessions: await listSessions() });
      return c.json(response);
    },
  )
  .get(
    "/sessions/discover",
    describeRoute({
      summary: "Discover resumable ACP sessions",
      responses: {
        200: jsonResponse("Resumable ACP sessions", resumableSessionsResponseSchema),
        400: jsonResponse("ACP session discovery error", errorResponseSchema),
      },
    }),
    vValidator("query", discoverResumableSessionsRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const request = c.req.valid("query") satisfies DiscoverResumableSessionsRequest;
        const resolved = resolveCodexResumeCommand(request.presetId);
        const context = await resolveProjectContext({
          projectId: request.projectId,
          cwd: request.cwd,
        });
        const response = parse(
          resumableSessionsResponseSchema,
          await discoverResumableSessions({
            command: resolved.command,
            args: resolved.args,
            cwd: context.cwd,
          }),
        );
        return c.json(response);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "failed to discover resumable sessions";
        return c.json({ error: message }, 400);
      }
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
        const context = await resolveProjectContext({
          projectId: request.projectId,
          cwd: request.cwd,
        });
        const preset = findPreset(resolved.presetId);
        const session = await createSession({
          projectId: context.project?.id ?? null,
          preset,
          command: resolved.command,
          args: resolved.args,
          cwd: context.cwd,
          initialModelId: request.modelId ?? null,
          initialModeId: request.modeId ?? null,
        });
        const response = parse(sessionResponseSchema, { session });
        return c.json(response, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to create session";
        return c.json({ error: message }, 400);
      }
    },
  )
  .post(
    "/sessions/load",
    describeRoute({
      summary: "Load existing ACP session",
      responses: {
        201: jsonResponse("Loaded ACP session", sessionResponseSchema),
        400: jsonResponse("ACP session load error", errorResponseSchema),
      },
    }),
    vValidator("json", loadSessionRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const request = c.req.valid("json");
        const resolved = resolveCodexResumeCommand(request.presetId);
        const context = await resolveProjectContext({
          projectId: request.projectId,
          cwd: request.cwd,
        });
        const discovered = await discoverResumableSessions({
          command: resolved.command,
          args: resolved.args,
          cwd: context.cwd,
        });

        if (!discovered.capability.canLoadIntoProvider) {
          throw new Error(
            discovered.capability.fallbackReason ??
              "This agent does not support loading existing sessions in the current PoC.",
          );
        }

        const candidate = discovered.sessions.find(
          (session) => session.sessionId === request.sessionId,
        );
        const session = await loadSession({
          projectId: context.project?.id ?? null,
          preset: resolved.preset,
          command: resolved.command,
          args: resolved.args,
          cwd: context.cwd,
          sessionId: request.sessionId,
          title: request.title ?? candidate?.title ?? null,
          updatedAt: request.updatedAt ?? candidate?.updatedAt ?? null,
        });
        const response = parse(sessionResponseSchema, { session });
        return c.json(response, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to load session";
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
  .get(
    "/sessions/:sessionId/messages",
    describeRoute({
      summary: "List ACP session messages",
      responses: {
        200: jsonResponse("ACP session messages", sessionMessagesResponseSchema),
      },
    }),
    async (c) => {
      const sessionId = c.req.param("sessionId");
      const response = parse(sessionMessagesResponseSchema, {
        messages: await listSessionMessages(sessionId),
      });
      return c.json(response);
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
        const response = parse(messageResponseSchema, await sendPrompt(sessionId, request));
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
    async (c) => {
      const removed = await removeSession(c.req.param("sessionId"));
      return c.json({ ok: removed });
    },
  );
