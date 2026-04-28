import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, test } from 'vitest';

import { createDatabase, createMemoryDatabase } from '../db/sqlite.ts';
import { createAppSetupStore } from './app-setup-store.ts';

const disposableClients: { close: () => void }[] = [];

afterEach(() => {
  for (const client of disposableClients.splice(0)) {
    client.close();
  }
});

describe('createAppSetupStore', () => {
  test('starts with initial setup incomplete', async () => {
    const database = createMemoryDatabase();
    disposableClients.push(database.client);

    const store = createAppSetupStore(database);

    await expect(store.getSetupState()).resolves.toEqual({
      initialSetupCompleted: false,
      completedAt: null,
    });
  });

  test('persists initial setup completion in sqlite', async () => {
    const database = createMemoryDatabase();
    disposableClients.push(database.client);

    const store = createAppSetupStore(database);
    const completed = await store.markInitialSetupCompleted();
    const restored = await store.getSetupState();

    expect(completed.initialSetupCompleted).toBe(true);
    expect(typeof completed.completedAt).toBe('string');
    expect(restored).toEqual(completed);
  });

  test('works with an existing managed sqlite database without app_settings', async () => {
    const sandboxDirectory = mkdtempSync(path.join(tmpdir(), 'remote-agent-app-setup-'));
    const databasePath = path.join(sandboxDirectory, 'legacy.sqlite');
    const legacyClient = new DatabaseSync(databasePath);
    legacyClient.exec(`
      CREATE TABLE projects (
        id text PRIMARY KEY,
        name text NOT NULL,
        working_directory text NOT NULL UNIQUE,
        created_at text NOT NULL
      );
    `);
    legacyClient.close();

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createAppSetupStore(database);

    await expect(store.getSetupState()).resolves.toEqual({
      initialSetupCompleted: false,
      completedAt: null,
    });
  });
});
