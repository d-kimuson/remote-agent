import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import type { ProjectSandboxSettings } from '../../shared/acp.ts';

import { createDatabase } from '../db/sqlite.ts';
import { createProjectStore } from './project-store.ts';

const disposableClients: { close: () => void }[] = [];

const defaultProjectSandbox: ProjectSandboxSettings = {
  enabled: false,
  filesystem: {
    allowRead: [],
    denyRead: [],
    allowWrite: ['.'],
    denyWrite: [],
  },
  network: {
    mode: 'inherit',
    allowedDomains: [],
  },
};

afterEach(() => {
  for (const client of disposableClients.splice(0)) {
    client.close();
  }
});

describe('createProjectStore', () => {
  test('starts with no projects until one is explicitly created', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-projects-'));
    const database = createDatabase(path.join(sandboxDirectory, 'remote-agent.sqlite'));
    disposableClients.push(database.client);

    const store = createProjectStore(database);

    await expect(store.listProjects()).resolves.toEqual([]);
    await expect(store.getProject('remote-agent')).rejects.toThrow('Unknown project: remote-agent');
  });

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

  test('stores editable project settings without trimming shell content', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-projects-'));
    const projectDirectory = path.join(sandboxDirectory, 'workspace-setup-script');
    await mkdir(projectDirectory, { recursive: true });

    const database = createDatabase(path.join(sandboxDirectory, 'remote-agent.sqlite'));
    disposableClients.push(database.client);

    const store = createProjectStore(database);
    const project = await store.createProject({
      name: 'Workspace Setup Script',
      workingDirectory: projectDirectory,
    });
    const script = '  echo setup > .remote-agent-setup\n';

    const settings = await store.updateProjectSettings(project.id, {
      name: 'Renamed Workspace',
      worktreeSetupScript: script,
      sandbox: defaultProjectSandbox,
    });
    const restoredProject = await store.getProject(project.id);

    expect(settings.worktreeSetupScript).toBe(script);
    expect(restoredProject.name).toBe('Renamed Workspace');
    expect(restoredProject.worktreeSetupScript).toBe(script);
  });

  test('stores last-used mode preferences per project and preset', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-projects-'));
    const projectDirectory = await mkdtemp(path.join(sandboxDirectory, 'workspace-'));

    const database = createDatabase(path.join(sandboxDirectory, 'remote-agent.sqlite'));
    disposableClients.push(database.client);

    const store = createProjectStore(database);
    const project = await store.createProject({
      name: 'Workspace Modes',
      workingDirectory: projectDirectory,
    });

    await store.updateProjectModePreference(project.id, {
      presetId: 'codex',
      modeId: 'read-only',
      markLastUsed: true,
    });
    const settings = await store.updateProjectModePreference(project.id, {
      presetId: 'codex',
      modeId: 'full-access',
      markLastUsed: true,
    });

    expect(settings.modePreferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          presetId: 'codex',
          modeId: 'read-only',
          lastUsedAt: null,
        }),
        expect.objectContaining({
          presetId: 'codex',
          modeId: 'full-access',
        }),
      ]),
    );
    expect(
      settings.modePreferences.find((entry) => entry.modeId === 'full-access')?.lastUsedAt,
    ).toEqual(expect.any(String));
  });
});
