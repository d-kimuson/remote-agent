import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { parse } from "valibot";

import { appInfoSchema } from "../shared/acp.ts";
import { acpRoutes } from "./acp/routes.ts";
import { agentPresets } from "./acp/presets.ts";
import { attachmentRoutes } from "./attachments/routes.ts";
import { filesystemRoutes } from "./filesystem/routes.ts";
import { jsonResponse } from "./hono-utils.ts";
import { getProjectsFilePath } from "./projects/project-store.ts";
import { projectRoutes } from "./projects/routes.ts";

export const routes = new Hono()
  .get(
    "/info",
    describeRoute({
      summary: "Get application info",
      responses: { 200: jsonResponse("Application info", appInfoSchema) },
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
  .route("/attachments", attachmentRoutes)
  .route("/filesystem", filesystemRoutes)
  .route("/projects", projectRoutes)
  .route("/acp", acpRoutes);

export type RouteType = typeof routes;
