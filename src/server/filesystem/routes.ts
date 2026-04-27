import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { Hono } from "hono";
import { describeRoute, validator as vValidator } from "hono-openapi";
import { object, optional, parse, pipe, string, trim } from "valibot";

import { filesystemTreeResponseSchema, type FilesystemEntry } from "../../shared/acp.ts";
import { errorResponseSchema, jsonResponse, validationErrorHook } from "../hono-utils.ts";

const filesystemTreeQuerySchema = object({
  root: optional(pipe(string(), trim())),
});

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

export const filesystemRoutes = new Hono().get(
  "/tree",
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
);
