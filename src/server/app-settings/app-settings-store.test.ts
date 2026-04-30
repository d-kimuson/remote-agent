import { afterEach, describe, expect, test } from 'vitest';

import { createMemoryDatabase } from '../db/sqlite.ts';
import { createAppSettingsStore } from './app-settings-store.ts';

const disposableClients: { close: () => void }[] = [];

afterEach(() => {
  for (const client of disposableClients.splice(0)) {
    client.close();
  }
});

describe('createAppSettingsStore', () => {
  test('starts with default settings', async () => {
    const database = createMemoryDatabase();
    disposableClients.push(database.client);

    const store = createAppSettingsStore(database);

    await expect(store.getSettings()).resolves.toEqual({
      submitKeyBinding: 'mod-enter',
    });
  });

  test('persists submit key binding in sqlite', async () => {
    const database = createMemoryDatabase();
    disposableClients.push(database.client);

    const store = createAppSettingsStore(database);
    const updated = await store.updateSettings({ submitKeyBinding: 'enter' });
    const restored = await store.getSettings();

    expect(updated).toEqual({ submitKeyBinding: 'enter' });
    expect(restored).toEqual(updated);
  });
});
