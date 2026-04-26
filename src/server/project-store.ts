import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "valibot";

import {
  projectSchema,
  projectsResponseSchema,
  type CreateProjectRequest,
  type Project,
} from "../shared/acp.ts";

const projectsFilePath = path.resolve(process.cwd(), "projects.local.json");

const slugify = (value: string): string => {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
};

const createDefaultProject = (): Project => {
  const workingDirectory = process.cwd();
  return parse(projectSchema, {
    id: slugify(path.basename(workingDirectory)),
    name: path.basename(workingDirectory),
    workingDirectory,
  });
};

const ensureProjectsFile = async (): Promise<void> => {
  try {
    await stat(projectsFilePath);
  } catch {
    await mkdir(path.dirname(projectsFilePath), { recursive: true });
    await writeFile(
      projectsFilePath,
      `${JSON.stringify({ projects: [createDefaultProject()] }, null, 2)}\n`,
      "utf8",
    );
  }
};

const readProjects = async (): Promise<readonly Project[]> => {
  await ensureProjectsFile();
  const fileText = await readFile(projectsFilePath, "utf8");
  const data: unknown = JSON.parse(fileText);
  const parsed = parse(projectsResponseSchema, data);
  return parsed.projects;
};

const writeProjects = async (projects: readonly Project[]): Promise<void> => {
  await writeFile(
    projectsFilePath,
    `${JSON.stringify(parse(projectsResponseSchema, { projects }), null, 2)}\n`,
    "utf8",
  );
};

const assertDirectory = async (workingDirectory: string): Promise<string> => {
  const resolvedPath = path.resolve(workingDirectory);
  const directoryStat = await stat(resolvedPath);
  if (!directoryStat.isDirectory()) {
    throw new Error("workingDirectory must be a directory");
  }

  return resolvedPath;
};

const uniqueProjectId = (projects: readonly Project[], projectName: string): string => {
  const baseId = slugify(projectName);
  const existingIds = new Set(projects.map((project) => project.id));
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let counter = 2;
  while (existingIds.has(`${baseId}-${counter}`)) {
    counter += 1;
  }

  return `${baseId}-${counter}`;
};

export const getProjectsFilePath = (): string => projectsFilePath;

export const listProjects = async (): Promise<readonly Project[]> => {
  return readProjects();
};

export const getProject = async (projectId: string): Promise<Project> => {
  const projects = await readProjects();
  const project = projects.find((entry) => entry.id === projectId);
  if (project === undefined) {
    throw new Error(`Unknown project: ${projectId}`);
  }

  return project;
};

export const createProject = async (request: CreateProjectRequest): Promise<Project> => {
  const projects = await readProjects();
  const workingDirectory = await assertDirectory(request.workingDirectory);
  const existingProject = projects.find((project) => project.workingDirectory === workingDirectory);
  if (existingProject !== undefined) {
    return existingProject;
  }

  const nextProject = parse(projectSchema, {
    id: uniqueProjectId(projects, request.name),
    name: request.name,
    workingDirectory,
  });

  await writeProjects([...projects, nextProject]);
  return nextProject;
};
