import { describe, expect, test } from 'vitest';

import { createMemoryDatabase } from '../../db/sqlite.ts';
import { createProviderCatalogStore } from './provider-catalog-store.ts';

describe('createProviderCatalogStore', () => {
  test('stores and resolves multiple Custom Providers', async () => {
    const database = createMemoryDatabase();
    const store = createProviderCatalogStore(database);

    try {
      await store.createCustomProvider({
        name: 'hoge-agent',
        commandText: 'custom-agent acp --profile "team space"',
      });
      await store.createCustomProvider({
        name: 'fuga-agent',
        commandText: 'npx fuga-agent --acp',
      });

      const statuses = await store.listProviderStatuses();
      const customStatuses = statuses.filter((status) => status.preset.id.startsWith('custom:'));
      expect(customStatuses).toHaveLength(2);

      const hogeStatus = customStatuses.find((status) => status.preset.label === 'hoge-agent');
      expect(hogeStatus?.preset).toMatchObject({
        command: 'custom-agent',
        args: ['acp', '--profile', 'team space'],
      });

      const preset = await store.resolveProviderPreset(hogeStatus?.preset.id ?? '');
      expect(preset).toMatchObject({
        label: 'hoge-agent',
        command: 'custom-agent',
        args: ['acp', '--profile', 'team space'],
      });
    } finally {
      database.client.close();
    }
  });

  test('requires Custom Provider command text when creating', async () => {
    const database = createMemoryDatabase();
    const store = createProviderCatalogStore(database);

    try {
      await expect(
        store.createCustomProvider({
          name: 'hoge-agent',
          commandText: '',
        }),
      ).rejects.toThrow('Custom Provider command is invalid: Command is required.');
    } finally {
      database.client.close();
    }
  });

  test('updates Custom Provider name and command', async () => {
    const database = createMemoryDatabase();
    const store = createProviderCatalogStore(database);

    try {
      await store.createCustomProvider({
        name: 'hoge-agent',
        commandText: 'npx hoge-agent --acp',
      });
      const before = await store.listProviderStatuses();
      const customProvider = before.find((status) => status.preset.label === 'hoge-agent');

      await store.updateCustomProvider({
        providerId: customProvider?.preset.id ?? '',
        name: 'hoge-agent-2',
        commandText: 'npx hoge-agent-v2 --acp --verbose',
      });

      const after = await store.listProviderStatuses();
      const updated = after.find((status) => status.preset.id === customProvider?.preset.id);
      expect(updated?.preset).toMatchObject({
        label: 'hoge-agent-2',
        command: 'npx',
        args: ['hoge-agent-v2', '--acp', '--verbose'],
      });
    } finally {
      database.client.close();
    }
  });
});
