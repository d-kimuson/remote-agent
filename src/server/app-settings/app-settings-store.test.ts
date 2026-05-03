import { afterEach, describe, expect, test } from 'vitest';

import type { AppSandboxSettings } from '../../shared/acp.ts';

import { createMemoryDatabase } from '../db/sqlite.ts';
import { createAppSettingsStore } from './app-settings-store.ts';

const disposableClients: { close: () => void }[] = [];

const defaultSandbox: AppSandboxSettings = {
  enabledProviderIds: [],
  filesystem: {
    allowRead: [],
    denyRead: [],
    allowWrite: ['.'],
    denyWrite: [],
  },
  network: {
    mode: 'none',
    allowedDomains: [
      'chatgpt.com',
      '*.chatgpt.com',
      'opencode.ai',
      '*.opencode.ai',
      'api.anthropic.com',
    ],
  },
};

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
      language: 'ja',
      submitKeyBinding: 'mod-enter',
      sandbox: defaultSandbox,
    });
  });

  test('persists submit key binding in sqlite', async () => {
    const database = createMemoryDatabase();
    disposableClients.push(database.client);

    const store = createAppSettingsStore(database);
    const updated = await store.updateSettings({
      language: 'en',
      submitKeyBinding: 'enter',
      sandbox: defaultSandbox,
    });
    const restored = await store.getSettings();

    expect(updated).toEqual({ language: 'en', submitKeyBinding: 'enter', sandbox: defaultSandbox });
    expect(restored).toEqual(updated);
  });
});
