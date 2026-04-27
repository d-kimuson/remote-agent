import { Hono } from "hono";
import { describeRoute, validator as vValidator } from "hono-openapi";
import { parse } from "valibot";

import {
  createProjectRequestSchema,
  projectResponseSchema,
  projectsResponseSchema,
} from "../../shared/acp.ts";
import { errorResponseSchema, jsonResponse, validationErrorHook } from "../hono-utils.ts";
import { createProject, getProject, listProjects } from "../project-store.ts";

export const projectRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      summary: "List projects",
      responses: { 200: jsonResponse("Projects", projectsResponseSchema) },
    }),
    async (c) => {
      const response = parse(projectsResponseSchema, { projects: await listProjects() });
      return c.json(response);
    },
  )
  .post(
    "/",
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
        const response = parse(projectResponseSchema, { project: await createProject(request) });
        return c.json(response, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to create project";
        return c.json({ error: message }, 400);
      }
    },
  )
  .get(
    "/:projectId",
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
  );
