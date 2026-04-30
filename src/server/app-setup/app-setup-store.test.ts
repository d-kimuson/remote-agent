import { afterEach, describe, expect, test } from 'vitest';

import { createMemoryDatabase } from '../db/sqlite.ts';
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
});
