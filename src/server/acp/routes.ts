import { Hono } from "hono";
import { describeRoute, validator as vValidator } from "hono-openapi";
import { boolean, object, parse } from "valibot";

import {
  agentModelCatalogQuerySchema,
  agentModelCatalogResponseSchema,
  agentProvidersResponseSchema,
  checkAgentProviderRequestSchema,
  createSessionRequestSchema,
  discoverResumableSessionsRequestSchema,
  loadSessionRequestSchema,
  messageResponseSchema,
  prepareAgentSessionRequestSchema,
  prepareAgentSessionResponseSchema,
  resumableSessionsResponseSchema,
  sendMessageRequestSchema,
  sessionMessagesResponseSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  updateAgentProviderRequestSchema,
  updateSessionRequestSchema,
  type CreateSessionRequest,
  type DiscoverResumableSessionsRequest,
  type SessionSummary,
} from "../../shared/acp.ts";
import { errorResponseSchema, jsonResponse, validationErrorHook } from "../hono-utils.ts";
import {
  getProject,
  getProjectSettings,
  updateProjectModelPreference,
} from "../projects/project-store.ts";
import { discoverResumableSessions } from "./services/agent-session-client.ts";
import { parseArgsText } from "./args.pure.ts";
import { excludeManagedResumableSessions } from "./session-resume.pure.ts";
import { probeAgentModelCatalog } from "./services/probe-agent-catalog.ts";
import { agentPresets } from "./presets.ts";
import {
  getProviderCatalog,
  markProviderCatalogError,
  listProviderStatuses,
  setProviderEnabled,
  upsertProviderCatalog,
} from "./repositories/provider-catalog-store.ts";
import {
  createPreparedSession,
  createSession,
  importSession,
  listSessionMessages,
  listSessions,
  removeSession,
  sendPrompt,
  updateSession,
} from "./services/session-store.ts";
import { subscribeAcpSse } from "./services/sse-broadcast.ts";

const deleteSessionResponseSchema = object({
  ok: boolean(),
});

const preparedSessions = new Map<string, Promise<SessionSummary>>();
const loadableProviderIds = new Set(["codex", "claude-code", "pi-coding-agent"]);

const findPreset = (presetId: string | null | undefined) => {
  const id = presetId ?? "codex";
  return agentPresets.find((preset) => preset.id === id) ?? null;
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
    throw new Error(`Unknown ACP provider preset: ${request.presetId ?? "codex"}`);
  }

  if (request.command !== null && request.command !== undefined) {
    throw new Error("Custom ACP commands are temporarily disabled. Use a provider preset.");
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

const cacheCatalogFromSession = async (session: SessionSummary): Promise<void> => {
  if (session.presetId === null || session.presetId === undefined) {
    return;
  }
  await upsertProviderCatalog({
    presetId: session.presetId,
    cwd: session.cwd,
    catalog: {
      availableModels: session.availableModels,
      availableModes: session.availableModes,
      currentModelId: session.currentModelId ?? null,
      currentModeId: session.currentModeId ?? null,
      lastError: null,
    },
  });
};

const nonEmpty = (value: string | null | undefined): string | null =>
  value !== null && value !== undefined && value.length > 0 ? value : null;

const resolveInitialModelId = async ({
  modelId,
  presetId,
  projectId,
}: {
  readonly projectId: string | null | undefined;
  readonly presetId: string;
  readonly modelId: string | null | undefined;
}): Promise<string | null> => {
  const requested = nonEmpty(modelId);
  if (requested !== null) {
    return requested;
  }
  if (projectId === null || projectId === undefined) {
    return null;
  }

  const settings = await getProjectSettings(projectId);
  const preferences = settings.modelPreferences.filter((entry) => entry.presetId === presetId);
  const lastUsed = preferences
    .filter((entry) => entry.lastUsedAt !== null && entry.lastUsedAt !== undefined)
    .sort((left, right) => (right.lastUsedAt ?? "").localeCompare(left.lastUsedAt ?? ""))[0];
  if (lastUsed !== undefined) {
    return lastUsed.modelId;
  }

  return preferences.find((entry) => entry.isFavorite)?.modelId ?? null;
};

const markProjectModelUsed = async (session: SessionSummary): Promise<void> => {
  const projectId = nonEmpty(session.projectId);
  const presetId = nonEmpty(session.presetId);
  const modelId = nonEmpty(session.currentModelId);
  if (projectId === null || presetId === null || modelId === null) {
    return;
  }

  await updateProjectModelPreference(projectId, {
    presetId,
    modelId,
    markLastUsed: true,
  });
};

const resolvePreset = (presetId: string | null | undefined) => {
  const preset = findPreset(presetId ?? "codex");

  if (preset === null) {
    throw new Error(`Unknown ACP provider preset: ${presetId ?? "codex"}`);
  }

  return preset;
};

const resolveResumeCommand = (presetId: string | null | undefined) => {
  const preset = resolvePreset(presetId);

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
    "/providers",
    describeRoute({
      summary: "List ACP provider presets and enabled state",
      responses: { 200: jsonResponse("ACP providers", agentProvidersResponseSchema) },
    }),
    async (c) => {
      const response = parse(agentProvidersResponseSchema, {
        providers: await listProviderStatuses(),
      });
      return c.json(response);
    },
  )
  .patch(
    "/providers/:presetId",
    describeRoute({
      summary: "Enable or disable an ACP provider preset",
      responses: {
        200: jsonResponse("ACP providers", agentProvidersResponseSchema),
        400: jsonResponse("ACP provider update error", errorResponseSchema),
      },
    }),
    vValidator("json", updateAgentProviderRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const request = c.req.valid("json");
        const providers = await setProviderEnabled({
          presetId: c.req.param("presetId"),
          enabled: request.enabled,
        });
        return c.json(parse(agentProvidersResponseSchema, { providers }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to update provider";
        return c.json({ error: message }, 400);
      }
    },
  )
  .post(
    "/providers/:presetId/check",
    describeRoute({
      summary: "Check ACP provider connectivity and refresh catalog",
      responses: {
        200: jsonResponse("Model/mode options", agentModelCatalogResponseSchema),
        400: jsonResponse("ACP provider check error", errorResponseSchema),
      },
    }),
    vValidator("json", checkAgentProviderRequestSchema, validationErrorHook),
    async (c) => {
      const presetId = c.req.param("presetId");
      const request = c.req.valid("json");
      const cwd = request.cwd ?? process.cwd();
      try {
        const raw = await probeAgentModelCatalog({ cwd, presetId });
        const catalog = parse(agentModelCatalogResponseSchema, {
          ...raw,
          lastError: null,
        });
        await upsertProviderCatalog({ presetId, cwd, catalog });
        return c.json(catalog);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to check provider";
        await markProviderCatalogError({ presetId, cwd, error: message });
        return c.json({ error: message }, 400);
      }
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
        const raw = await getProviderCatalog({
          presetId: request.presetId,
          cwd: project.workingDirectory,
        });
        return c.json(
          parse(
            agentModelCatalogResponseSchema,
            raw ?? {
              availableModels: [],
              availableModes: [],
              currentModelId: null,
              currentModeId: null,
              lastError: null,
            },
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to read model catalog";
        return c.json({ error: message }, 400);
      }
    },
  )
  .post(
    "/agent/prepare",
    describeRoute({
      summary: "Start an ACP provider session in the background for a draft chat",
      responses: {
        202: jsonResponse("Prepared session handle", prepareAgentSessionResponseSchema),
        400: jsonResponse("ACP prepare error", errorResponseSchema),
      },
    }),
    vValidator("json", prepareAgentSessionRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const request = c.req.valid("json");
        const preset = resolvePreset(request.presetId);
        const context = await resolveProjectContext({
          projectId: request.projectId,
          cwd: request.cwd,
        });
        const initialModelId = await resolveInitialModelId({
          projectId: context.project?.id ?? null,
          presetId: preset.id,
          modelId: request.modelId ?? null,
        });
        const prepareId = crypto.randomUUID();
        const sessionPromise = createPreparedSession({
          projectId: context.project?.id ?? null,
          preset,
          command: preset.command,
          args: preset.args,
          cwd: context.cwd,
          initialModelId,
          initialModeId: request.modeId ?? null,
        }).then(async (session) => {
          await cacheCatalogFromSession(session);
          await markProjectModelUsed(session);
          return session;
        });
        preparedSessions.set(prepareId, sessionPromise);
        sessionPromise.catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "failed to prepare agent";
          void markProviderCatalogError({
            presetId: preset.id,
            cwd: context.cwd,
            error: message,
          });
          preparedSessions.delete(prepareId);
        });
        return c.json(parse(prepareAgentSessionResponseSchema, { prepareId }), 202);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to prepare agent";
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
        const resolved = resolveResumeCommand(request.presetId);
        if (!loadableProviderIds.has(resolved.preset.id)) {
          throw new Error(`Loading sessions is not supported for provider: ${resolved.preset.id}`);
        }
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
        const managedSessionIds = new Set(
          (await listSessions()).map((session) => session.sessionId),
        );
        return c.json(
          parse(resumableSessionsResponseSchema, {
            ...response,
            sessions: excludeManagedResumableSessions({
              candidates: response.sessions,
              managedSessionIds,
            }),
          }),
        );
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
        if (preset === null) {
          throw new Error(`Unknown ACP provider preset: ${resolved.presetId ?? "codex"}`);
        }
        const initialModelId = await resolveInitialModelId({
          projectId: context.project?.id ?? null,
          presetId: preset.id,
          modelId: request.modelId ?? null,
        });
        const session = await createSession({
          projectId: context.project?.id ?? null,
          preset,
          command: resolved.command,
          args: resolved.args,
          cwd: context.cwd,
          initialModelId,
          initialModeId: request.modeId ?? null,
        });
        await cacheCatalogFromSession(session);
        await markProjectModelUsed(session);
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
        const resolved = resolveResumeCommand(request.presetId);
        if (!loadableProviderIds.has(resolved.preset.id)) {
          throw new Error(`Loading sessions is not supported for provider: ${resolved.preset.id}`);
        }
        const context = await resolveProjectContext({
          projectId: request.projectId,
          cwd: request.cwd,
        });
        const catalog = await getProviderCatalog({
          presetId: resolved.preset.id,
          cwd: context.cwd,
        });
        const session = await importSession({
          projectId: context.project?.id ?? null,
          preset: resolved.preset,
          command: resolved.command,
          args: resolved.args,
          cwd: context.cwd,
          sessionId: request.sessionId,
          title: request.title ?? null,
          updatedAt: request.updatedAt ?? null,
          availableModes: catalog?.availableModes ?? [],
          availableModels: catalog?.availableModels ?? [],
          currentModeId: catalog?.currentModeId ?? null,
          currentModelId: catalog?.currentModelId ?? null,
        });
        await markProjectModelUsed(session);
        const response = parse(sessionResponseSchema, { session });
        return c.json(response, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to load session";
        return c.json({ error: message }, 400);
      }
    },
  )
  .post(
    "/sessions/prepared/:prepareId/messages",
    describeRoute({
      summary: "Send message to a prepared ACP session",
      responses: {
        200: jsonResponse("ACP message response", messageResponseSchema),
        400: jsonResponse("ACP prepared message error", errorResponseSchema),
      },
    }),
    vValidator("json", sendMessageRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const sessionPromise = preparedSessions.get(c.req.param("prepareId"));
        if (sessionPromise === undefined) {
          throw new Error(`Prepared session not found: ${c.req.param("prepareId")}`);
        }
        const session = await sessionPromise;
        const request = c.req.valid("json");
        const response = parse(messageResponseSchema, await sendPrompt(session.sessionId, request));
        await markProjectModelUsed(response.session);
        return c.json(response);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "failed to send prompt to prepared session";
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
        await markProjectModelUsed(session);
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
        await markProjectModelUsed(response.session);
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
