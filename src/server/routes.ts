import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { Hono } from "hono";
import { describeRoute, resolver, validator as vValidator } from "hono-openapi";
import { boolean, object, optional, parse, pipe, string, trim } from "valibot";

import {
  appInfoSchema,
  createProjectRequestSchema,
  createSessionRequestSchema,
  filesystemTreeResponseSchema,
  messageResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  sendMessageRequestSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  type CreateSessionRequest,
  type FilesystemEntry,
  updateSessionRequestSchema,
} from "../shared/acp.ts";
import { parseArgsText } from "./acp/args.pure.ts";
import { agentPresets } from "./acp/presets.ts";
import {
  createSession,
  listSessions,
  removeSession,
  sendPrompt,
  updateSession,
} from "./acp/session-store.ts";
import { createProject, getProject, getProjectsFilePath, listProjects } from "./project-store.ts";

type ResolverSchema = Parameters<typeof resolver>[0];

const errorResponseSchema = object({
  error: string(),
});

const deleteSessionResponseSchema = object({
  ok: boolean(),
});

const filesystemTreeQuerySchema = object({
  root: optional(pipe(string(), trim())),
});

const jsonContent = (schema: ResolverSchema) => ({
  "application/json": {
    schema: resolver(schema),
  },
});

const jsonResponse = (description: string, schema: ResolverSchema) => ({
  description,
  content: jsonContent(schema),
});

const validationErrorHook = (
  result: Parameters<NonNullable<Parameters<typeof vValidator>[2]>>[0],
  c: Parameters<NonNullable<Parameters<typeof vValidator>[2]>>[1],
) => {
  if (!result.success) {
    return c.json({ error: result.error?.[0]?.message ?? "invalid request" }, 400);
  }
};

const ignoredDirectoryNames = new Set([".git", "node_modules", "dist", ".next", ".turbo"]);

const readDirectoryTree = async (rootPath: string): Promise<FilesystemEntry> => {
  const resolvedRoot = path.resolve(rootPath);
  const directoryStat = await stat(resolvedRoot);
  if (!directoryStat.isDirectory()) {
    throw new Error("root must be a directory");
  }

  const entries = await readdir(resolvedRoot, { withFileTypes: true });
  const children = entries
    .filter((entry) => !entry.name.startsWith(".") && !ignoredDirectoryNames.has(entry.name))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, 200)
    .map(
      (entry) =>
        ({
          name: entry.name,
          path: path.join(resolvedRoot, entry.name),
          kind: entry.isDirectory() ? "directory" : "file",
        }) as const,
    );

  return {
    name: path.basename(resolvedRoot) || resolvedRoot,
    path: resolvedRoot,
    kind: "directory",
    children,
  };
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
  .get(
    "/info",
    describeRoute({
      summary: "Get application info",
      responses: {
        200: jsonResponse("Application info", appInfoSchema),
      },
    }),
    (c) => {
      const response = parse(appInfoSchema, {
        appName: "ACP Playground",
        workingDirectory: process.cwd(),
        projectsFilePath: getProjectsFilePath(),
        agentPresets,
      });

      return c.json(response);
    },
  )
  .get(
    "/filesystem/tree",
    describeRoute({
      summary: "Get filesystem tree",
      responses: {
        200: jsonResponse("Filesystem tree", filesystemTreeResponseSchema),
        400: jsonResponse("Directory read error", errorResponseSchema),
      },
    }),
    vValidator("query", filesystemTreeQuerySchema, validationErrorHook),
    async (c) => {
      try {
        const rootPath = c.req.valid("query").root ?? process.cwd();
        const response = parse(filesystemTreeResponseSchema, {
          root: await readDirectoryTree(rootPath),
        });

        return c.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to read directory tree";
        return c.json({ error: message }, 400);
      }
    },
  )
  .get(
    "/projects",
    describeRoute({
      summary: "List projects",
      responses: {
        200: jsonResponse("Projects", projectsResponseSchema),
      },
    }),
    async (c) => {
      const response = parse(projectsResponseSchema, {
        projects: await listProjects(),
      });

      return c.json(response);
    },
  )
  .get(
    "/projects/:projectId",
    describeRoute({
      summary: "Get project",
      responses: {
        200: jsonResponse("Project", projectResponseSchema),
        404: jsonResponse("Project not found", errorResponseSchema),
      },
    }),
    async (c) => {
      try {
        const response = parse(projectResponseSchema, {
          project: await getProject(c.req.param("projectId")),
        });

        return c.json(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to read project";
        return c.json({ error: message }, 404);
      }
    },
  )
  .post(
    "/projects",
    describeRoute({
      summary: "Create project",
      responses: {
        201: jsonResponse("Created project", projectResponseSchema),
        400: jsonResponse("Project creation error", errorResponseSchema),
      },
    }),
    vValidator("json", createProjectRequestSchema, validationErrorHook),
    async (c) => {
      try {
        const request = c.req.valid("json");
        const response = parse(projectResponseSchema, {
          project: await createProject(request),
        });

        return c.json(response, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to create project";
        return c.json({ error: message }, 400);
      }
    },
  )
  .get(
    "/acp/sessions",
    describeRoute({
      summary: "List ACP sessions",
      responses: {
        200: jsonResponse("ACP sessions", sessionsResponseSchema),
      },
    }),
    (c) => {
      const response = parse(sessionsResponseSchema, {
        sessions: listSessions(),
      });

      return c.json(response);
    },
  )
  .post(
    "/acp/sessions",
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
    "/acp/sessions/:sessionId",
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
    "/acp/sessions/:sessionId/messages",
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
    "/acp/sessions/:sessionId",
    describeRoute({
      summary: "Delete ACP session",
      responses: {
        200: jsonResponse("Delete result", deleteSessionResponseSchema),
      },
    }),
    (c) => {
      const removed = removeSession(c.req.param("sessionId"));

      return c.json({ ok: removed });
    },
  );

export type RouteType = typeof routes;
