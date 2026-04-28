import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { createDatabase } from '../db/sqlite.ts';
import { createProjectStore } from './project-store.ts';

const disposableClients: { close: () => void }[] = [];

afterEach(() => {
  for (const client of disposableClients.splice(0)) {
    client.close();
  }
});

describe('createProjectStore', () => {
  test('persists projects in sqlite and restores them from a new store instance', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-projects-'));
    const firstProjectDirectory = path.join(sandboxDirectory, 'workspace-a');
    await mkdir(firstProjectDirectory, { recursive: true });

    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');
    const firstDatabase = createDatabase(databasePath);
    disposableClients.push(firstDatabase.client);

    const firstStore = createProjectStore(firstDatabase);
    const createdProject = await firstStore.createProject({
      name: 'Workspace A',
      workingDirectory: firstProjectDirectory,
    });

    expect(createdProject).toMatchObject({
      id: 'workspace-a',
      name: 'Workspace A',
      workingDirectory: firstProjectDirectory,
    });

    const secondDatabase = createDatabase(databasePath);
    disposableClients.push(secondDatabase.client);

    const secondStore = createProjectStore(secondDatabase);
    const restoredProjects = await secondStore.listProjects();

    expect(restoredProjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createdProject.id,
          workingDirectory: firstProjectDirectory,
        }),
      ]),
    );
  });

  test('returns the existing project when the same working directory is registered twice', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-projects-'));
    const projectDirectory = path.join(sandboxDirectory, 'workspace-b');
    await mkdir(projectDirectory, { recursive: true });

    const database = createDatabase(path.join(sandboxDirectory, 'remote-agent.sqlite'));
    disposableClients.push(database.client);

    const store = createProjectStore(database);
    const firstProject = await store.createProject({
      name: 'Workspace B',
      workingDirectory: projectDirectory,
    });
    const secondProject = await store.createProject({
      name: 'Workspace B Duplicate',
      workingDirectory: projectDirectory,
    });

    expect(secondProject).toEqual(firstProject);
  });

  test('stores favorite and last-used model preferences per project and preset', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-projects-'));
    const projectDirectory = path.join(sandboxDirectory, 'workspace-models');
    await mkdir(projectDirectory, { recursive: true });

    const database = createDatabase(path.join(sandboxDirectory, 'remote-agent.sqlite'));
    disposableClients.push(database.client);

    const store = createProjectStore(database);
    const project = await store.createProject({
      name: 'Workspace Models',
      workingDirectory: projectDirectory,
    });

    await store.updateProjectModelPreference(project.id, {
      presetId: 'codex',
      modelId: 'gpt-5-codex',
      isFavorite: true,
    });
    const settings = await store.updateProjectModelPreference(project.id, {
      presetId: 'codex',
      modelId: 'gpt-5-codex-mini',
      markLastUsed: true,
    });

    expect(settings.modelPreferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          presetId: 'codex',
          modelId: 'gpt-5-codex',
          isFavorite: true,
          lastUsedAt: null,
        }),
        expect.objectContaining({
          presetId: 'codex',
          modelId: 'gpt-5-codex-mini',
          isFavorite: false,
        }),
      ]),
    );
    expect(
      settings.modelPreferences.find((entry) => entry.modelId === 'gpt-5-codex-mini')?.lastUsedAt,
    ).toEqual(expect.any(String));
  });
});
