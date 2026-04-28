import { and, eq } from 'drizzle-orm';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'valibot';

import {
  projectSettingsSchema,
  projectSchema,
  projectsResponseSchema,
  type CreateProjectRequest,
  type Project,
  type ProjectModelPreference,
  type ProjectSettings,
  type UpdateProjectModelPreferenceRequest,
} from '../../shared/acp.ts';
import { projectModelPreferencesTable, projectsTable } from '../db/schema.ts';
import { type AppDatabase, getDefaultDatabase } from '../db/sqlite.ts';
import { envService } from '../env.ts';

const slugify = (value: string): string => {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
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

const assertDirectory = async (workingDirectory: string): Promise<string> => {
  const resolvedPath = path.resolve(workingDirectory);
  const directoryStat = await stat(resolvedPath);
  if (!directoryStat.isDirectory()) {
    throw new Error('workingDirectory must be a directory');
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

const mapProjectRecord = (record: typeof projectsTable.$inferSelect): Project => {
  return parse(projectSchema, {
    id: record.id,
    name: record.name,
    workingDirectory: record.workingDirectory,
  });
};

const mapProjectModelPreferenceRecord = (
  record: typeof projectModelPreferencesTable.$inferSelect,
): ProjectModelPreference => ({
  presetId: record.presetId,
  modelId: record.modelId,
  isFavorite: record.isFavorite === 'true',
  lastUsedAt: record.lastUsedAt,
  updatedAt: record.updatedAt,
});

export const createProjectStore = (database: AppDatabase = getDefaultDatabase()) => {
  const ensureDefaultProject = async (): Promise<void> => {
    const existingProjects = await database.db.select().from(projectsTable).limit(1);
    if (existingProjects.length > 0) {
      return;
    }

    const defaultProject = createDefaultProject();
    await database.db.insert(projectsTable).values({
      id: defaultProject.id,
      name: defaultProject.name,
      workingDirectory: defaultProject.workingDirectory,
      createdAt: new Date().toISOString(),
    });
  };

  const readProjects = async (): Promise<readonly Project[]> => {
    await ensureDefaultProject();
    const records = await database.db.select().from(projectsTable);
    const projects = records.map(mapProjectRecord);
    return parse(projectsResponseSchema, { projects }).projects;
  };

  const listProjects = async (): Promise<readonly Project[]> => {
    return readProjects();
  };

  const getProject = async (projectId: string): Promise<Project> => {
    await ensureDefaultProject();
    const [record] = await database.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);
    if (record === undefined) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    return mapProjectRecord(record);
  };

  const createProject = async (request: CreateProjectRequest): Promise<Project> => {
    const projects = await readProjects();
    const workingDirectory = await assertDirectory(request.workingDirectory);
    const existingProject = projects.find(
      (project) => project.workingDirectory === workingDirectory,
    );
    if (existingProject !== undefined) {
      return existingProject;
    }

    const nextProject = parse(projectSchema, {
      id: uniqueProjectId(projects, request.name),
      name: request.name,
      workingDirectory,
    });

    await database.db.insert(projectsTable).values({
      id: nextProject.id,
      name: nextProject.name,
      workingDirectory: nextProject.workingDirectory,
      createdAt: new Date().toISOString(),
    });

    return nextProject;
  };

  const getProjectSettings = async (projectId: string): Promise<ProjectSettings> => {
    await getProject(projectId);
    const records = await database.db
      .select()
      .from(projectModelPreferencesTable)
      .where(eq(projectModelPreferencesTable.projectId, projectId));

    const modelPreferences = records.map(mapProjectModelPreferenceRecord).sort((left, right) => {
      if (left.presetId !== right.presetId) {
        return left.presetId.localeCompare(right.presetId);
      }
      if (left.isFavorite !== right.isFavorite) {
        return left.isFavorite ? -1 : 1;
      }
      return (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? '');
    });

    return parse(projectSettingsSchema, {
      projectId,
      modelPreferences,
    });
  };

  const updateProjectModelPreference = async (
    projectId: string,
    request: UpdateProjectModelPreferenceRequest,
  ): Promise<ProjectSettings> => {
    await getProject(projectId);
    const now = new Date().toISOString();
    const [existing] = await database.db
      .select()
      .from(projectModelPreferencesTable)
      .where(
        and(
          eq(projectModelPreferencesTable.projectId, projectId),
          eq(projectModelPreferencesTable.presetId, request.presetId),
          eq(projectModelPreferencesTable.modelId, request.modelId),
        ),
      )
      .limit(1);

    if (request.markLastUsed === true) {
      await database.db
        .update(projectModelPreferencesTable)
        .set({ lastUsedAt: null, updatedAt: now })
        .where(
          and(
            eq(projectModelPreferencesTable.projectId, projectId),
            eq(projectModelPreferencesTable.presetId, request.presetId),
          ),
        );
    }

    await database.db
      .insert(projectModelPreferencesTable)
      .values({
        projectId,
        presetId: request.presetId,
        modelId: request.modelId,
        isFavorite:
          request.isFavorite === undefined
            ? (existing?.isFavorite ?? 'false')
            : request.isFavorite
              ? 'true'
              : 'false',
        lastUsedAt: request.markLastUsed === true ? now : (existing?.lastUsedAt ?? null),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          projectModelPreferencesTable.projectId,
          projectModelPreferencesTable.presetId,
          projectModelPreferencesTable.modelId,
        ],
        set: {
          isFavorite:
            request.isFavorite === undefined
              ? (existing?.isFavorite ?? 'false')
              : request.isFavorite
                ? 'true'
                : 'false',
          lastUsedAt: request.markLastUsed === true ? now : (existing?.lastUsedAt ?? null),
          updatedAt: now,
        },
      });

    return getProjectSettings(projectId);
  };

  return {
    storagePath: database.storagePath,
    listProjects,
    getProject,
    createProject,
    getProjectSettings,
    updateProjectModelPreference,
  };
};

let defaultProjectStore: ReturnType<typeof createProjectStore> | undefined = undefined;

const getProjectStore = () => {
  defaultProjectStore ??= createProjectStore();
  return defaultProjectStore;
};

export const getProjectsFilePath = (): string => {
  return envService.getEnv('RA_DIR');
};

export const listProjects = async (): Promise<readonly Project[]> => {
  return getProjectStore().listProjects();
};

export const getProject = async (projectId: string): Promise<Project> => {
  return getProjectStore().getProject(projectId);
};

export const createProject = async (request: CreateProjectRequest): Promise<Project> => {
  return getProjectStore().createProject(request);
};

export const getProjectSettings = async (projectId: string): Promise<ProjectSettings> => {
  return getProjectStore().getProjectSettings(projectId);
};

export const updateProjectModelPreference = async (
  projectId: string,
  request: UpdateProjectModelPreferenceRequest,
): Promise<ProjectSettings> => {
  return getProjectStore().updateProjectModelPreference(projectId, request);
};
