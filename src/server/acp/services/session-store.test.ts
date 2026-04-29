import type { SessionNotification } from '@agentclientprotocol/sdk';
import type { ACPProvider } from '@mcpc-tech/acp-ai-provider';

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import type { AgentPreset } from '../../../shared/acp.ts';

import { agentProviderCatalogsTable, sessionMessagesTable } from '../../db/schema.ts';
import { createDatabase, createMemoryDatabase } from '../../db/sqlite.ts';
import { createSessionStore } from './session-store.ts';

const codexPreset: AgentPreset = {
  id: 'codex',
  label: 'Codex',
  description: 'test preset',
  command: 'npx',
  args: ['-y', '@zed-industries/codex-acp'],
  authMethodId: 'chatgpt',
};

const stubLanguageModel: ACPProvider['languageModel'] = (): ReturnType<
  ACPProvider['languageModel']
> => {
  /* oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- test-only stub; full ACPLanguageModel is supplied by the real provider in production */
  return {} as ReturnType<ACPProvider['languageModel']>;
};

const disposableClients: { close: () => void }[] = [];

afterEach(() => {
  for (const client of disposableClients.splice(0)) {
    client.close();
  }
});

describe('createSessionStore', () => {
  test('persists session metadata and marks restored sessions as inactive', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const firstDatabase = createDatabase(databasePath);
    disposableClients.push(firstDatabase.client);

    const firstStore = createSessionStore({
      database: firstDatabase,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'session-1',
            modes: {
              currentModeId: 'balanced',
              availableModes: [{ id: 'balanced', name: 'Balanced' }],
            },
            models: {
              currentModelId: 'gpt-5-codex',
              availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
    });

    const createdSession = await firstStore.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
    });

    expect(createdSession).toMatchObject({
      sessionId: 'session-1',
      origin: 'new',
      status: 'paused',
      isActive: true,
    });

    const activeSessions = await firstStore.listSessions();
    expect(activeSessions).toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        status: 'paused',
        isActive: true,
        currentModeId: 'balanced',
        currentModelId: 'gpt-5-codex',
      }),
    ]);

    const secondDatabase = createDatabase(databasePath);
    disposableClients.push(secondDatabase.client);

    const secondStore = createSessionStore({ database: secondDatabase });
    const restoredSessions = await secondStore.listSessions();

    expect(restoredSessions).toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        origin: 'new',
        status: 'inactive',
        isActive: false,
        projectId: null,
      }),
    ]);
  });

  test('updates persisted session metadata after mode and model changes', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'session-2',
            modes: {
              currentModeId: 'balanced',
              availableModes: [
                { id: 'balanced', name: 'Balanced' },
                { id: 'high', name: 'High' },
              ],
            },
            models: {
              currentModelId: 'gpt-5-codex',
              availableModels: [
                { modelId: 'gpt-5-codex', name: 'GPT-5 Codex' },
                { modelId: 'gpt-5-codex-mini', name: 'GPT-5 Codex Mini' },
              ],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
    });

    await store.updateSession('session-2', {
      modeId: 'high',
      modelId: 'gpt-5-codex-mini',
    });

    const reloadedDatabase = createDatabase(databasePath);
    disposableClients.push(reloadedDatabase.client);

    const restoredStore = createSessionStore({ database: reloadedDatabase });
    const restoredSessions = await restoredStore.listSessions();

    expect(restoredSessions).toEqual([
      expect.objectContaining({
        sessionId: 'session-2',
        currentModeId: 'high',
        currentModelId: 'gpt-5-codex-mini',
        status: 'inactive',
        isActive: false,
      }),
    ]);
  });

  test('passes preset authMethodId to ACP provider creation for codex sessions', async () => {
    const database = createMemoryDatabase();
    disposableClients.push(database.client);

    let observedAuthMethodId: string | undefined = undefined;

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: ({ authMethodId }) => {
        observedAuthMethodId = authMethodId;
        return {
          cleanup: () => {},
          initSession: () =>
            Promise.resolve({
              sessionId: 'session-auth-method',
              modes: { currentModeId: '', availableModes: [] },
              models: { currentModelId: '', availableModels: [] },
            }),
          languageModel: stubLanguageModel,
          setMode: async () => {},
          setModel: async () => {},
          tools: {},
        };
      },
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: process.cwd(),
    });

    expect(observedAuthMethodId).toBe('chatgpt');
  });

  test('passes preset authMethodId to ACP provider creation for pi sessions', async () => {
    const database = createMemoryDatabase();
    disposableClients.push(database.client);

    let observedAuthMethodId: string | undefined = undefined;

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/pi-acp'),
      createProvider: ({ authMethodId }) => {
        observedAuthMethodId = authMethodId;
        return {
          cleanup: () => {},
          initSession: () =>
            Promise.resolve({
              sessionId: 'session-auth-method-pi',
              modes: { currentModeId: '', availableModes: [] },
              models: { currentModelId: '', availableModels: [] },
            }),
          languageModel: stubLanguageModel,
          setMode: async () => {},
          setModel: async () => {},
          tools: {},
        };
      },
    });

    await store.createSession({
      projectId: null,
      preset: {
        id: 'pi-coding-agent',
        label: 'pi-coding-agent',
        description: 'test preset',
        command: 'pi-acp',
        args: [],
        authMethodId: 'pi_terminal_login',
      },
      command: 'pi-acp',
      args: [],
      cwd: process.cwd(),
    });

    expect(observedAuthMethodId).toBe('pi_terminal_login');
  });

  test('infers authMethodId for Codex-compatible Custom Provider sessions', async () => {
    const database = createMemoryDatabase();
    disposableClients.push(database.client);

    let observedAuthMethodId: string | undefined = undefined;

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex-acp'),
      createProvider: ({ authMethodId }) => {
        observedAuthMethodId = authMethodId;
        return {
          cleanup: () => {},
          initSession: () =>
            Promise.resolve({
              sessionId: 'session-custom-auth-method',
              modes: { currentModeId: '', availableModes: [] },
              models: { currentModelId: '', availableModels: [] },
            }),
          languageModel: stubLanguageModel,
          setMode: async () => {},
          setModel: async () => {},
          tools: {},
        };
      },
    });

    await store.createSession({
      projectId: null,
      preset: {
        id: 'custom:codex',
        label: 'Custom Codex',
        description: 'test custom preset',
        command: 'codex-acp',
        args: [],
        authMethodId: undefined,
      },
      command: 'codex-acp',
      args: [],
      cwd: process.cwd(),
    });

    expect(observedAuthMethodId).toBe('chatgpt');
  });

  test('updates generic session config options through the ACP connection and persists them', async () => {
    const database = createDatabase(':memory:');
    disposableClients.push(database.client);

    const observedRequests: {
      readonly sessionId: string;
      readonly configId: string;
      readonly value: string;
    }[] = [];

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => {
        const provider = {
          cleanup: () => {},
          initSession: () =>
            Promise.resolve({
              sessionId: 'session-config',
              modes: { currentModeId: '', availableModes: [] },
              models: { currentModelId: '', availableModels: [] },
              configOptions: [
                {
                  type: 'select' as const,
                  id: 'verbosity',
                  name: 'Verbosity',
                  currentValue: 'medium',
                  options: [
                    { value: 'low', name: 'Low' },
                    { value: 'medium', name: 'Medium' },
                    { value: 'high', name: 'High' },
                  ],
                },
              ],
            }),
          languageModel: stubLanguageModel,
          model: {
            client: {
              setPermissionRequestHandler: () => {},
            },
            connection: {
              setSessionConfigOption: (input: {
                readonly sessionId: string;
                readonly configId: string;
                readonly value: string;
              }) => {
                observedRequests.push(input);
                return Promise.resolve({
                  configOptions: [
                    {
                      type: 'select' as const,
                      id: 'verbosity',
                      name: 'Verbosity',
                      currentValue: input.value,
                      options: [
                        { value: 'low', name: 'Low' },
                        { value: 'medium', name: 'Medium' },
                        { value: 'high', name: 'High' },
                      ],
                    },
                  ],
                });
              },
            },
            sessionId: 'provider-session-config',
          },
          setMode: async () => {},
          setModel: async () => {},
          tools: {},
        };
        return provider;
      },
    });

    const created = await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: process.cwd(),
    });

    expect(created.configOptions).toEqual([
      expect.objectContaining({
        id: 'verbosity',
        currentValue: 'medium',
      }),
    ]);

    const updated = await store.updateSessionConfigOption('session-config', {
      configId: 'verbosity',
      value: 'high',
    });

    expect(observedRequests).toEqual([
      {
        sessionId: 'provider-session-config',
        configId: 'verbosity',
        value: 'high',
      },
    ]);
    expect(updated.configOptions).toEqual([
      expect.objectContaining({
        id: 'verbosity',
        currentValue: 'high',
      }),
    ]);
    expect((await store.listSessions())[0]?.configOptions).toEqual([
      expect.objectContaining({
        id: 'verbosity',
        currentValue: 'high',
      }),
    ]);
  });

  test('persists user and assistant messages and returns them via listMessages', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'session-msgs',
            modes: {
              currentModeId: 'balanced',
              availableModes: [{ id: 'balanced', name: 'Balanced' }],
            },
            models: {
              currentModelId: 'gpt-5-codex',
              availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
      promptCollector: () =>
        Promise.resolve({
          text: 'pong',
          rawEvents: [],
          alreadyPersisted: false,
          assistantSegmentMessages: [],
        }),
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
    });

    await store.sendPrompt('session-msgs', { prompt: 'ping' });

    const messages = await store.listMessages('session-msgs');

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', text: 'ping' });
    expect(messages[1]).toMatchObject({ role: 'assistant', text: 'pong' });

    const reloadedDatabase = createDatabase(databasePath);
    disposableClients.push(reloadedDatabase.client);

    const restoredStore = createSessionStore({ database: reloadedDatabase });
    const restoredMessages = await restoredStore.listMessages('session-msgs');

    expect(restoredMessages.map((message) => message.text)).toEqual(['ping', 'pong']);
  });

  test('marks active session as running only while a prompt response is pending', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const promptStarted = Promise.withResolvers<void>();
    const releasePrompt = Promise.withResolvers<void>();

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'session-running',
            modes: {
              currentModeId: 'balanced',
              availableModes: [{ id: 'balanced', name: 'Balanced' }],
            },
            models: {
              currentModelId: 'gpt-5-codex',
              availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
      promptCollector: async () => {
        promptStarted.resolve();
        await releasePrompt.promise;
        return {
          text: 'pong',
          rawEvents: [],
          alreadyPersisted: false,
          assistantSegmentMessages: [],
        };
      },
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
    });

    const sendPromise = store.sendPrompt('session-running', { prompt: 'ping' });
    await promptStarted.promise;

    expect(await store.listSessions()).toEqual([
      expect.objectContaining({
        sessionId: 'session-running',
        isActive: true,
        status: 'running',
      }),
    ]);

    releasePrompt.resolve();
    const response = await sendPromise;

    expect(response.session).toMatchObject({
      sessionId: 'session-running',
      status: 'paused',
      isActive: true,
    });
    expect(await store.listSessions()).toEqual([
      expect.objectContaining({
        sessionId: 'session-running',
        isActive: true,
        status: 'paused',
      }),
    ]);
  });

  test('persists assistant error line when prompt collection throws', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'session-err',
            modes: {
              currentModeId: 'balanced',
              availableModes: [{ id: 'balanced', name: 'Balanced' }],
            },
            models: {
              currentModelId: 'gpt-5-codex',
              availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
      promptCollector: () => Promise.reject(new Error('model exploded')),
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
    });

    await expect(store.sendPrompt('session-err', { prompt: 'ping' })).rejects.toThrow(
      'model exploded',
    );

    const messages = await store.listMessages('session-err');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', text: 'ping' });
    expect(messages[1]).toMatchObject({ role: 'assistant', text: 'Error: model exploded' });
  });

  test('persists user and assistant error when session tuning fails before collection', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'session-tuning-err',
            modes: {
              currentModeId: 'balanced',
              availableModes: [{ id: 'balanced', name: 'Balanced' }],
            },
            models: {
              currentModelId: 'gpt-5-codex',
              availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: () => Promise.reject(new Error('mode unavailable')),
        setModel: async () => {},
        tools: {},
      }),
      promptCollector: () =>
        Promise.resolve({
          text: 'unreachable',
          rawEvents: [],
          alreadyPersisted: false,
          assistantSegmentMessages: [],
        }),
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
    });

    await expect(
      store.sendPrompt('session-tuning-err', { prompt: 'ping', modeId: 'strict' }),
    ).rejects.toThrow('mode unavailable');

    const messages = await store.listMessages('session-tuning-err');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', text: 'ping' });
    expect(messages[1]).toMatchObject({ role: 'assistant', text: 'Error: mode unavailable' });
  });

  test('loads an existing session into an active provider and persists it as loaded', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    let receivedExistingSessionId: string | null = null;

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: ({ existingSessionId }) => {
        receivedExistingSessionId = existingSessionId ?? null;

        return {
          cleanup: () => {},
          initSession: () =>
            Promise.resolve({
              sessionId: 'ignored-by-load',
              modes: {
                currentModeId: 'balanced',
                availableModes: [{ id: 'balanced', name: 'Balanced' }],
              },
              models: {
                currentModelId: 'gpt-5-codex',
                availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
              },
            }),
          languageModel: stubLanguageModel,
          setMode: async () => {},
          setModel: async () => {},
          tools: {},
        };
      },
    });

    const loadedSession = await store.loadSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
      sessionId: 'existing-session-1',
      title: 'Recovered Session',
      updatedAt: '2026-04-27T00:00:00.000Z',
    });

    expect(receivedExistingSessionId).toBe('existing-session-1');
    expect(loadedSession).toMatchObject({
      sessionId: 'existing-session-1',
      origin: 'loaded',
      title: 'Recovered Session',
      updatedAt: '2026-04-27T00:00:00.000Z',
      status: 'paused',
      isActive: true,
    });

    const restoredDatabase = createDatabase(databasePath);
    disposableClients.push(restoredDatabase.client);

    const restoredStore = createSessionStore({ database: restoredDatabase });
    const restoredSessions = await restoredStore.listSessions();

    expect(restoredSessions).toEqual([
      expect.objectContaining({
        sessionId: 'existing-session-1',
        origin: 'loaded',
        title: 'Recovered Session',
        updatedAt: '2026-04-27T00:00:00.000Z',
        status: 'inactive',
        isActive: false,
      }),
    ]);
  });

  test('imports an existing session into the database without starting a provider', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      createProvider: () => {
        throw new Error('provider should not start during importSession');
      },
      importProviderMessages: (_presetId, sessionId) =>
        Promise.resolve([
          {
            id: `codex-log:${sessionId}:0`,
            role: 'user',
            kind: 'user',
            rawJson: {
              schemaVersion: 1,
              type: 'user',
              role: 'user',
              text: 'imported prompt',
              attachments: [],
              createdAt: '2026-04-27T00:00:00.000Z',
            },
            text: 'imported prompt',
            rawEvents: [],
            createdAt: '2026-04-27T00:00:00.000Z',
            updatedAt: '2026-04-27T00:00:00.000Z',
            streamPartId: null,
            metadataJson: '{"source":"codex-session-log"}',
          },
        ]),
    });

    const importedSession = await store.importSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
      sessionId: 'existing-session-db-only',
      title: 'Recovered DB-only Session',
      updatedAt: '2026-04-27T00:00:00.000Z',
      availableModes: [{ id: 'balanced', name: 'Balanced', description: null }],
      availableModels: [{ id: 'gpt-5-codex', name: 'GPT-5 Codex', description: null }],
      currentModeId: 'balanced',
      currentModelId: 'gpt-5-codex',
    });

    expect(importedSession).toMatchObject({
      sessionId: 'existing-session-db-only',
      origin: 'loaded',
      title: 'Recovered DB-only Session',
      updatedAt: '2026-04-27T00:00:00.000Z',
      status: 'inactive',
      isActive: false,
      currentModeId: 'balanced',
      currentModelId: 'gpt-5-codex',
    });
    expect(importedSession.availableModels).toEqual([
      { id: 'gpt-5-codex', name: 'GPT-5 Codex', description: null },
    ]);

    const restoredSessions = await store.listSessions();
    expect(restoredSessions).toEqual([
      expect.objectContaining({
        sessionId: 'existing-session-db-only',
        status: 'inactive',
        isActive: false,
        firstUserMessagePreview: 'imported prompt',
        availableModels: [{ id: 'gpt-5-codex', name: 'GPT-5 Codex', description: null }],
      }),
    ]);
    expect(
      (await store.listMessages('existing-session-db-only')).map((message) => message.text),
    ).toEqual(['imported prompt']);
  });

  test('listMessages backfills provider log messages for imported sessions with empty messages', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      createProvider: () => {
        throw new Error('provider should not start during importSession');
      },
      importProviderMessages: () => Promise.resolve([]),
    });

    await store.importSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
      sessionId: 'existing-session-backfill',
      title: 'Backfill Session',
      updatedAt: '2026-04-27T00:00:00.000Z',
      availableModes: [],
      availableModels: [],
      currentModeId: null,
      currentModelId: null,
    });

    expect(await store.listMessages('existing-session-backfill')).toEqual([]);

    const database2 = createDatabase(databasePath);
    disposableClients.push(database2.client);

    const storeAfterRestart = createSessionStore({
      database: database2,
      importProviderMessages: (_presetId, sessionId) =>
        Promise.resolve([
          {
            id: `codex-log:${sessionId}:0`,
            role: 'user',
            kind: 'user',
            rawJson: {
              schemaVersion: 1,
              type: 'user',
              role: 'user',
              text: 'backfilled prompt',
              attachments: [],
              createdAt: '2026-04-27T00:00:00.000Z',
            },
            text: 'backfilled prompt',
            rawEvents: [],
            createdAt: '2026-04-27T00:00:00.000Z',
            updatedAt: '2026-04-27T00:00:00.000Z',
            streamPartId: null,
            metadataJson: '{"source":"codex-session-log"}',
          },
        ]),
    });

    expect(
      (await storeAfterRestart.listMessages('existing-session-backfill')).map(
        (message) => message.text,
      ),
    ).toEqual(['backfilled prompt']);
  });

  test('listSessions enriches imported sessions with the cached provider catalog', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    await database.db.insert(agentProviderCatalogsTable).values({
      presetId: 'codex',
      cwd: sandboxDirectory,
      availableModesJson: JSON.stringify([{ id: 'balanced', name: 'Balanced', description: null }]),
      availableModelsJson: JSON.stringify([
        { id: 'gpt-5-codex', name: 'GPT-5 Codex', description: null },
      ]),
      currentModeId: 'balanced',
      currentModelId: 'gpt-5-codex',
      lastError: null,
      refreshedAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T00:00:00.000Z',
    });

    const store = createSessionStore({
      database,
      createProvider: () => {
        throw new Error('provider should not start during importSession');
      },
      importProviderMessages: () => Promise.resolve([]),
    });

    await store.importSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
      sessionId: 'existing-session-catalog-fallback',
      title: 'Catalog fallback Session',
      updatedAt: '2026-04-27T00:00:00.000Z',
      availableModes: [],
      availableModels: [],
      currentModeId: null,
      currentModelId: null,
    });

    expect(await store.listSessions()).toEqual([
      expect.objectContaining({
        sessionId: 'existing-session-catalog-fallback',
        currentModeId: 'balanced',
        currentModelId: 'gpt-5-codex',
        availableModes: [{ id: 'balanced', name: 'Balanced', description: null }],
        availableModels: [{ id: 'gpt-5-codex', name: 'GPT-5 Codex', description: null }],
      }),
    ]);
  });

  test('imports Codex session log messages when loading a Codex session with no stored messages', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'ignored-by-load',
            modes: {
              currentModeId: 'balanced',
              availableModes: [{ id: 'balanced', name: 'Balanced' }],
            },
            models: {
              currentModelId: 'gpt-5-codex',
              availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
      importProviderMessages: (_presetId, sessionId) =>
        Promise.resolve([
          {
            id: `codex-log:${sessionId}:0`,
            role: 'user',
            kind: 'user',
            rawJson: {
              schemaVersion: 1,
              type: 'user',
              role: 'user',
              text: 'old prompt',
              attachments: [],
              createdAt: '2026-04-27T10:00:00.000Z',
            },
            text: 'old prompt',
            rawEvents: [],
            createdAt: '2026-04-27T10:00:00.000Z',
            updatedAt: '2026-04-27T10:00:00.000Z',
            streamPartId: null,
            metadataJson: '{"source":"codex-session-log"}',
          },
          {
            id: `codex-log:${sessionId}:1`,
            role: 'assistant',
            kind: 'assistant_text',
            rawJson: {
              schemaVersion: 1,
              type: 'assistant_text',
              role: 'assistant',
              streamPartId: `codex-log:${sessionId}:1`,
              providerStreamId: `codex-log:${sessionId}:1`,
              text: 'old answer',
              createdAt: '2026-04-27T10:00:01.000Z',
            },
            text: 'old answer',
            rawEvents: [],
            createdAt: '2026-04-27T10:00:01.000Z',
            updatedAt: '2026-04-27T10:00:01.000Z',
            streamPartId: null,
            metadataJson: '{"source":"codex-session-log"}',
          },
        ]),
    });

    await store.loadSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
      sessionId: 'existing-codex-session',
      title: null,
      updatedAt: null,
    });

    const messages = await store.listMessages('existing-codex-session');
    expect(messages.map((message) => message.text)).toEqual(['old prompt', 'old answer']);

    const sessions = await store.listSessions();
    expect(sessions[0]).toMatchObject({
      sessionId: 'existing-codex-session',
      firstUserMessagePreview: 'old prompt',
    });
  });

  test('loadSession preserves createdAt and origin when rehydrating from the database', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'session-1',
            modes: {
              currentModeId: 'balanced',
              availableModes: [{ id: 'balanced', name: 'Balanced' }],
            },
            models: {
              currentModelId: 'gpt-5-codex',
              availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
    });

    const created = await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
    });
    const createdAtBefore = created.createdAt;

    const database2 = createDatabase(databasePath);
    disposableClients.push(database2.client);

    const storeAfterRestart = createSessionStore({
      database: database2,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: ({ existingSessionId }) => {
        expect(existingSessionId).toBe('session-1');

        return {
          cleanup: () => {},
          initSession: () =>
            Promise.resolve({
              sessionId: 'ignored',
              modes: {
                currentModeId: 'balanced',
                availableModes: [{ id: 'balanced', name: 'Balanced' }],
              },
              models: {
                currentModelId: 'gpt-5-codex',
                availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
              },
            }),
          languageModel: stubLanguageModel,
          setMode: async () => {},
          setModel: async () => {},
          tools: {},
        };
      },
    });

    const loaded = await storeAfterRestart.loadSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
      sessionId: 'session-1',
      title: null,
      updatedAt: null,
    });

    expect(loaded.createdAt).toBe(createdAtBefore);
    expect(loaded.origin).toBe('new');
  });

  test('loadSession restores the model used by the stored conversation', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'session-model-restore',
            modes: {
              currentModeId: 'balanced',
              availableModes: [{ id: 'balanced', name: 'Balanced' }],
            },
            models: {
              currentModelId: 'gpt-5-codex',
              availableModels: [
                { modelId: 'gpt-5-codex', name: 'GPT-5 Codex' },
                { modelId: 'gpt-5-codex-mini', name: 'GPT-5 Codex Mini' },
              ],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
    });
    await store.updateSession('session-model-restore', {
      modelId: 'gpt-5-codex-mini',
    });

    const database2 = createDatabase(databasePath);
    disposableClients.push(database2.client);
    const restoredModels: string[] = [];
    const storeAfterRestart = createSessionStore({
      database: database2,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'ignored',
            models: {
              currentModelId: 'gpt-5-codex',
              availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: (modelId) => {
          restoredModels.push(modelId);
          return Promise.resolve();
        },
        tools: {},
      }),
    });

    const loaded = await storeAfterRestart.loadSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
      sessionId: 'session-model-restore',
      title: null,
      updatedAt: null,
    });

    expect(restoredModels).toEqual(['gpt-5-codex-mini']);
    expect(loaded.currentModelId).toBe('gpt-5-codex-mini');
  });

  test('loadSession keeps existing session_messages (persistSession must not delete sessions row)', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'session-1',
            modes: {
              currentModeId: 'balanced',
              availableModes: [{ id: 'balanced', name: 'Balanced' }],
            },
            models: {
              currentModelId: 'gpt-5-codex',
              availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
    });

    await database.db.insert(sessionMessagesTable).values({
      id: 'message-row-1',
      sessionId: 'session-1',
      kind: 'user',
      textForSearch: 'prior turn',
      rawJson: JSON.stringify({
        schemaVersion: 1,
        type: 'user',
        role: 'user',
        text: 'prior turn',
        attachments: [],
        createdAt: '2026-04-27T10:00:00.000Z',
      }),
      createdAt: '2026-04-27T10:00:00.000Z',
    });

    const database2 = createDatabase(databasePath);
    disposableClients.push(database2.client);

    const store2 = createSessionStore({
      database: database2,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: ({ existingSessionId }) => {
        expect(existingSessionId).toBe('session-1');
        return {
          cleanup: () => {},
          initSession: () =>
            Promise.resolve({
              sessionId: 'ignored',
              modes: {
                currentModeId: 'balanced',
                availableModes: [{ id: 'balanced', name: 'Balanced' }],
              },
              models: {
                currentModelId: 'gpt-5-codex',
                availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
              },
            }),
          languageModel: stubLanguageModel,
          setMode: async () => {},
          setModel: async () => {},
          tools: {},
        };
      },
    });

    await store2.loadSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
      sessionId: 'session-1',
      title: null,
      updatedAt: null,
    });

    const messages = await store2.listMessages('session-1');
    expect(messages).toEqual([
      expect.objectContaining({
        id: 'message-row-1',
        role: 'user',
        text: 'prior turn',
      }),
    ]);
  });

  test('observes ACP session updates through the provider client handler', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const databasePath = path.join(sandboxDirectory, 'remote-agent.sqlite');
    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const installedHandlers: ((params: SessionNotification) => void)[] = [];
    const client = {
      setSessionUpdateHandler: (handler: (params: SessionNotification) => void) => {
        installedHandlers.push(handler);
      },
    };

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        client,
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'session-updates',
            modes: {
              currentModeId: 'balanced',
              availableModes: [{ id: 'balanced', name: 'Balanced' }],
            },
            models: {
              currentModelId: 'gpt-5-codex',
              availableModels: [{ modelId: 'gpt-5-codex', name: 'GPT-5 Codex' }],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
    });

    client.setSessionUpdateHandler(() => {});
    const installedHandler = installedHandlers[0];
    if (installedHandler === undefined) {
      throw new Error('expected wrapped session update handler');
    }

    installedHandler({
      sessionId: 'session-updates',
      update: {
        sessionUpdate: 'session_info_update',
        title: 'Agent named this session',
        updatedAt: '2026-04-29T00:00:00.000Z',
      },
    });
    installedHandler({
      sessionId: 'session-updates',
      update: { sessionUpdate: 'usage_update', used: 1200, size: 4000 },
    });
    installedHandler({
      sessionId: 'session-updates',
      update: {
        sessionUpdate: 'available_commands_update',
        availableCommands: [{ name: 'review', description: 'Review current changes' }],
      },
    });
    installedHandler({
      sessionId: 'session-updates',
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-1',
        title: 'Edit file',
        kind: 'edit',
        status: 'in_progress',
        locations: [{ path: 'src/app.ts', line: 12 }],
      },
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect((await store.listSessions())[0]).toMatchObject({
      sessionId: 'session-updates',
      title: 'Agent named this session',
      updatedAt: '2026-04-29T00:00:00.000Z',
    });
    const messages = await store.listMessages('session-updates');
    expect(messages.map((message) => message.kind)).toContain('raw_meta');
    expect(messages.map((message) => message.text)).toEqual(
      expect.arrayContaining([
        'context 1200/4000 tokens (30%)',
        '/review',
        JSON.stringify({
          toolCallId: 'tool-1',
          title: 'Edit file',
          kind: 'edit',
          status: 'in_progress',
          locations: [{ path: 'src/app.ts', line: 12 }],
        }),
      ]),
    );
  });

  test('cancels a running prompt and persists an abort message', async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), 'remote-agent-sessions-'));
    const database = createDatabase(':memory:');
    disposableClients.push(database.client);

    const observedAbortSignals: AbortSignal[] = [];
    let releasePrompt: (() => void) | null = null;
    const promptStarted = new Promise<void>((resolve) => {
      releasePrompt = resolve;
    });

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve('/bin/codex'),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: 'session-cancel',
            modes: { currentModeId: '', availableModes: [] },
            models: { currentModelId: '', availableModels: [] },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
      promptCollector: async (_provider, _prompt, options) => {
        observedAbortSignals.push(options.abortSignal);
        releasePrompt?.();
        await new Promise<void>((resolve) => {
          options.abortSignal.addEventListener('abort', () => {
            resolve();
          });
        });
        throw new DOMException('cancelled', 'AbortError');
      },
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: 'npx',
      args: ['-y', '@zed-industries/codex-acp'],
      cwd: sandboxDirectory,
    });

    const promptPromise = store.sendPrompt('session-cancel', {
      prompt: 'long running prompt',
      attachmentIds: [],
    });
    await promptStarted;

    const cancelledSession = await store.cancelSession('session-cancel');
    const response = await promptPromise;
    const messages = await store.listMessages('session-cancel');

    expect(observedAbortSignals[0]?.aborted).toBe(true);
    expect(cancelledSession.status).toBe('paused');
    expect(response.session.status).toBe('paused');
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'abort',
          text: 'Cancelled',
        }),
      ]),
    );
  });
});
