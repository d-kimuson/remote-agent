import type { ACPProvider } from '@mcpc-tech/acp-ai-provider';

import { describe, expect, test } from 'vitest';

import type { AgentPreset } from '../../../shared/acp.ts';

import { createMemoryDatabase } from '../../db/sqlite.ts';
import { createSessionStore } from './session-store.ts';

const codexPreset: AgentPreset = {
  id: 'codex',
  label: 'Codex',
  description: 'test preset',
  command: 'npx',
  args: [],
};

const stubLanguageModel: ACPProvider['languageModel'] = (): ReturnType<
  ACPProvider['languageModel']
> => {
  /* oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- test-only stub; full ACPLanguageModel is supplied by the real provider in production */
  return {} as ReturnType<ACPProvider['languageModel']>;
};

describe('createSessionStore permission handling', () => {
  test('installs permission request handler on the acp-ai-provider model client', async () => {
    const database = createMemoryDatabase();
    let installedHandler: unknown = null;
    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'session-permission',
          }),
        languageModel: stubLanguageModel,
        model: {
          client: {
            setPermissionRequestHandler: (handler: unknown) => {
              installedHandler = handler;
            },
          },
        },
        setMode: () => Promise.resolve(),
        setModel: () => Promise.resolve(),
        tools: {},
      }),
    });

    try {
      await store.createSession({
        projectId: null,
        preset: codexPreset,
        command: 'npx',
        args: [],
        cwd: process.cwd(),
      });

      expect(typeof installedHandler).toBe('function');
    } finally {
      database.client.close();
    }
  });
});
