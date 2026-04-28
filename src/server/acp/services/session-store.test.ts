import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ACPProvider } from "@mcpc-tech/acp-ai-provider";
import { afterEach, describe, expect, test } from "vitest";

import type { AgentPreset } from "../../../shared/acp.ts";
import { createDatabase } from "../../db/sqlite.ts";
import { sessionMessagesTable } from "../../db/schema.ts";
import { createSessionStore } from "./session-store.ts";

const codexPreset: AgentPreset = {
  id: "codex",
  label: "Codex",
  description: "test preset",
  command: "npx",
  args: ["-y", "@zed-industries/codex-acp"],
};

const stubLanguageModel: ACPProvider["languageModel"] = (): ReturnType<
  ACPProvider["languageModel"]
> => {
  /* oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- test-only stub; full ACPLanguageModel is supplied by the real provider in production */
  return {} as ReturnType<ACPProvider["languageModel"]>;
};

const disposableClients: { close: () => void }[] = [];

afterEach(() => {
  for (const client of disposableClients.splice(0)) {
    client.close();
  }
});

describe("createSessionStore", () => {
  test("persists session metadata and marks restored sessions as inactive", async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), "acp-playground-sessions-"));
    const databasePath = path.join(sandboxDirectory, "playground.sqlite");

    const firstDatabase = createDatabase(databasePath);
    disposableClients.push(firstDatabase.client);

    const firstStore = createSessionStore({
      database: firstDatabase,
      resolveCommand: () => Promise.resolve("/bin/codex"),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: "session-1",
            modes: {
              currentModeId: "balanced",
              availableModes: [{ id: "balanced", name: "Balanced" }],
            },
            models: {
              currentModelId: "gpt-5-codex",
              availableModels: [{ modelId: "gpt-5-codex", name: "GPT-5 Codex" }],
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
      command: "npx",
      args: ["-y", "@zed-industries/codex-acp"],
      cwd: sandboxDirectory,
    });

    expect(createdSession).toMatchObject({
      sessionId: "session-1",
      origin: "new",
      status: "paused",
      isActive: true,
    });

    const activeSessions = await firstStore.listSessions();
    expect(activeSessions).toEqual([
      expect.objectContaining({
        sessionId: "session-1",
        status: "paused",
        isActive: true,
        currentModeId: "balanced",
        currentModelId: "gpt-5-codex",
      }),
    ]);

    const secondDatabase = createDatabase(databasePath);
    disposableClients.push(secondDatabase.client);

    const secondStore = createSessionStore({ database: secondDatabase });
    const restoredSessions = await secondStore.listSessions();

    expect(restoredSessions).toEqual([
      expect.objectContaining({
        sessionId: "session-1",
        origin: "new",
        status: "inactive",
        isActive: false,
        projectId: null,
      }),
    ]);
  });

  test("updates persisted session metadata after mode and model changes", async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), "acp-playground-sessions-"));
    const databasePath = path.join(sandboxDirectory, "playground.sqlite");

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve("/bin/codex"),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: "session-2",
            modes: {
              currentModeId: "balanced",
              availableModes: [
                { id: "balanced", name: "Balanced" },
                { id: "high", name: "High" },
              ],
            },
            models: {
              currentModelId: "gpt-5-codex",
              availableModels: [
                { modelId: "gpt-5-codex", name: "GPT-5 Codex" },
                { modelId: "gpt-5-codex-mini", name: "GPT-5 Codex Mini" },
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
      command: "npx",
      args: ["-y", "@zed-industries/codex-acp"],
      cwd: sandboxDirectory,
    });

    await store.updateSession("session-2", {
      modeId: "high",
      modelId: "gpt-5-codex-mini",
    });

    const reloadedDatabase = createDatabase(databasePath);
    disposableClients.push(reloadedDatabase.client);

    const restoredStore = createSessionStore({ database: reloadedDatabase });
    const restoredSessions = await restoredStore.listSessions();

    expect(restoredSessions).toEqual([
      expect.objectContaining({
        sessionId: "session-2",
        currentModeId: "high",
        currentModelId: "gpt-5-codex-mini",
        status: "inactive",
        isActive: false,
      }),
    ]);
  });

  test("persists user and assistant messages and returns them via listMessages", async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), "acp-playground-sessions-"));
    const databasePath = path.join(sandboxDirectory, "playground.sqlite");

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve("/bin/codex"),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: "session-msgs",
            modes: {
              currentModeId: "balanced",
              availableModes: [{ id: "balanced", name: "Balanced" }],
            },
            models: {
              currentModelId: "gpt-5-codex",
              availableModels: [{ modelId: "gpt-5-codex", name: "GPT-5 Codex" }],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
      promptCollector: () =>
        Promise.resolve({
          text: "pong",
          rawEvents: [],
          alreadyPersisted: false,
          assistantSegmentMessages: [],
        }),
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: "npx",
      args: ["-y", "@zed-industries/codex-acp"],
      cwd: sandboxDirectory,
    });

    await store.sendPrompt("session-msgs", { prompt: "ping" });

    const messages = await store.listMessages("session-msgs");

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", text: "ping" });
    expect(messages[1]).toMatchObject({ role: "assistant", text: "pong" });

    const reloadedDatabase = createDatabase(databasePath);
    disposableClients.push(reloadedDatabase.client);

    const restoredStore = createSessionStore({ database: reloadedDatabase });
    const restoredMessages = await restoredStore.listMessages("session-msgs");

    expect(restoredMessages.map((message) => message.text)).toEqual(["ping", "pong"]);
  });

  test("marks active session as running only while a prompt response is pending", async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), "acp-playground-sessions-"));
    const databasePath = path.join(sandboxDirectory, "playground.sqlite");

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const promptStarted = Promise.withResolvers<void>();
    const releasePrompt = Promise.withResolvers<void>();

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve("/bin/codex"),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: "session-running",
            modes: {
              currentModeId: "balanced",
              availableModes: [{ id: "balanced", name: "Balanced" }],
            },
            models: {
              currentModelId: "gpt-5-codex",
              availableModels: [{ modelId: "gpt-5-codex", name: "GPT-5 Codex" }],
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
          text: "pong",
          rawEvents: [],
          alreadyPersisted: false,
          assistantSegmentMessages: [],
        };
      },
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: "npx",
      args: ["-y", "@zed-industries/codex-acp"],
      cwd: sandboxDirectory,
    });

    const sendPromise = store.sendPrompt("session-running", { prompt: "ping" });
    await promptStarted.promise;

    expect(await store.listSessions()).toEqual([
      expect.objectContaining({
        sessionId: "session-running",
        isActive: true,
        status: "running",
      }),
    ]);

    releasePrompt.resolve();
    const response = await sendPromise;

    expect(response.session).toMatchObject({
      sessionId: "session-running",
      status: "paused",
      isActive: true,
    });
    expect(await store.listSessions()).toEqual([
      expect.objectContaining({
        sessionId: "session-running",
        isActive: true,
        status: "paused",
      }),
    ]);
  });

  test("persists assistant error line when prompt collection throws", async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), "acp-playground-sessions-"));
    const databasePath = path.join(sandboxDirectory, "playground.sqlite");

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve("/bin/codex"),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: "session-err",
            modes: {
              currentModeId: "balanced",
              availableModes: [{ id: "balanced", name: "Balanced" }],
            },
            models: {
              currentModelId: "gpt-5-codex",
              availableModels: [{ modelId: "gpt-5-codex", name: "GPT-5 Codex" }],
            },
          }),
        languageModel: stubLanguageModel,
        setMode: async () => {},
        setModel: async () => {},
        tools: {},
      }),
      promptCollector: () => Promise.reject(new Error("model exploded")),
    });

    await store.createSession({
      projectId: null,
      preset: codexPreset,
      command: "npx",
      args: ["-y", "@zed-industries/codex-acp"],
      cwd: sandboxDirectory,
    });

    await expect(store.sendPrompt("session-err", { prompt: "ping" })).rejects.toThrow(
      "model exploded",
    );

    const messages = await store.listMessages("session-err");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", text: "ping" });
    expect(messages[1]).toMatchObject({ role: "assistant", text: "Error: model exploded" });
  });

  test("loads an existing session into an active provider and persists it as loaded", async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), "acp-playground-sessions-"));
    const databasePath = path.join(sandboxDirectory, "playground.sqlite");

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    let receivedExistingSessionId: string | null = null;

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve("/bin/codex"),
      createProvider: ({ existingSessionId }) => {
        receivedExistingSessionId = existingSessionId ?? null;

        return {
          cleanup: () => {},
          initSession: () =>
            Promise.resolve({
              sessionId: "ignored-by-load",
              modes: {
                currentModeId: "balanced",
                availableModes: [{ id: "balanced", name: "Balanced" }],
              },
              models: {
                currentModelId: "gpt-5-codex",
                availableModels: [{ modelId: "gpt-5-codex", name: "GPT-5 Codex" }],
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
      command: "npx",
      args: ["-y", "@zed-industries/codex-acp"],
      cwd: sandboxDirectory,
      sessionId: "existing-session-1",
      title: "Recovered Session",
      updatedAt: "2026-04-27T00:00:00.000Z",
    });

    expect(receivedExistingSessionId).toBe("existing-session-1");
    expect(loadedSession).toMatchObject({
      sessionId: "existing-session-1",
      origin: "loaded",
      title: "Recovered Session",
      updatedAt: "2026-04-27T00:00:00.000Z",
      status: "paused",
      isActive: true,
    });

    const restoredDatabase = createDatabase(databasePath);
    disposableClients.push(restoredDatabase.client);

    const restoredStore = createSessionStore({ database: restoredDatabase });
    const restoredSessions = await restoredStore.listSessions();

    expect(restoredSessions).toEqual([
      expect.objectContaining({
        sessionId: "existing-session-1",
        origin: "loaded",
        title: "Recovered Session",
        updatedAt: "2026-04-27T00:00:00.000Z",
        status: "inactive",
        isActive: false,
      }),
    ]);
  });

  test("loadSession preserves createdAt and origin when rehydrating from the database", async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), "acp-playground-sessions-"));
    const databasePath = path.join(sandboxDirectory, "playground.sqlite");

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve("/bin/codex"),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: "session-1",
            modes: {
              currentModeId: "balanced",
              availableModes: [{ id: "balanced", name: "Balanced" }],
            },
            models: {
              currentModelId: "gpt-5-codex",
              availableModels: [{ modelId: "gpt-5-codex", name: "GPT-5 Codex" }],
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
      command: "npx",
      args: ["-y", "@zed-industries/codex-acp"],
      cwd: sandboxDirectory,
    });
    const createdAtBefore = created.createdAt;

    const database2 = createDatabase(databasePath);
    disposableClients.push(database2.client);

    const storeAfterRestart = createSessionStore({
      database: database2,
      resolveCommand: () => Promise.resolve("/bin/codex"),
      createProvider: ({ existingSessionId }) => {
        expect(existingSessionId).toBe("session-1");

        return {
          cleanup: () => {},
          initSession: () =>
            Promise.resolve({
              sessionId: "ignored",
              modes: {
                currentModeId: "balanced",
                availableModes: [{ id: "balanced", name: "Balanced" }],
              },
              models: {
                currentModelId: "gpt-5-codex",
                availableModels: [{ modelId: "gpt-5-codex", name: "GPT-5 Codex" }],
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
      command: "npx",
      args: ["-y", "@zed-industries/codex-acp"],
      cwd: sandboxDirectory,
      sessionId: "session-1",
      title: null,
      updatedAt: null,
    });

    expect(loaded.createdAt).toBe(createdAtBefore);
    expect(loaded.origin).toBe("new");
  });

  test("loadSession restores the model used by the stored conversation", async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), "acp-playground-sessions-"));
    const databasePath = path.join(sandboxDirectory, "playground.sqlite");

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve("/bin/codex"),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: "session-model-restore",
            modes: {
              currentModeId: "balanced",
              availableModes: [{ id: "balanced", name: "Balanced" }],
            },
            models: {
              currentModelId: "gpt-5-codex",
              availableModels: [
                { modelId: "gpt-5-codex", name: "GPT-5 Codex" },
                { modelId: "gpt-5-codex-mini", name: "GPT-5 Codex Mini" },
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
      command: "npx",
      args: ["-y", "@zed-industries/codex-acp"],
      cwd: sandboxDirectory,
    });
    await store.updateSession("session-model-restore", {
      modelId: "gpt-5-codex-mini",
    });

    const database2 = createDatabase(databasePath);
    disposableClients.push(database2.client);
    const restoredModels: string[] = [];
    const storeAfterRestart = createSessionStore({
      database: database2,
      resolveCommand: () => Promise.resolve("/bin/codex"),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: "ignored",
            models: {
              currentModelId: "gpt-5-codex",
              availableModels: [{ modelId: "gpt-5-codex", name: "GPT-5 Codex" }],
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
      command: "npx",
      args: ["-y", "@zed-industries/codex-acp"],
      cwd: sandboxDirectory,
      sessionId: "session-model-restore",
      title: null,
      updatedAt: null,
    });

    expect(restoredModels).toEqual(["gpt-5-codex-mini"]);
    expect(loaded.currentModelId).toBe("gpt-5-codex-mini");
  });

  test("loadSession keeps existing session_messages (persistSession must not delete sessions row)", async () => {
    const sandboxDirectory = await mkdtemp(path.join(tmpdir(), "acp-playground-sessions-"));
    const databasePath = path.join(sandboxDirectory, "playground.sqlite");

    const database = createDatabase(databasePath);
    disposableClients.push(database.client);

    const store = createSessionStore({
      database,
      resolveCommand: () => Promise.resolve("/bin/codex"),
      createProvider: () => ({
        cleanup: () => {},
        initSession: () =>
          Promise.resolve({
            sessionId: "session-1",
            modes: {
              currentModeId: "balanced",
              availableModes: [{ id: "balanced", name: "Balanced" }],
            },
            models: {
              currentModelId: "gpt-5-codex",
              availableModels: [{ modelId: "gpt-5-codex", name: "GPT-5 Codex" }],
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
      command: "npx",
      args: ["-y", "@zed-industries/codex-acp"],
      cwd: sandboxDirectory,
    });

    await database.db.insert(sessionMessagesTable).values({
      id: "message-row-1",
      sessionId: "session-1",
      role: "user",
      text: "prior turn",
      rawEventsJson: "[]",
      createdAt: "2026-04-27T10:00:00.000Z",
      messageKind: "user",
      streamPartId: null,
      metadataJson: "{}",
      updatedAt: "2026-04-27T10:00:00.000Z",
    });

    const database2 = createDatabase(databasePath);
    disposableClients.push(database2.client);

    const store2 = createSessionStore({
      database: database2,
      resolveCommand: () => Promise.resolve("/bin/codex"),
      createProvider: ({ existingSessionId }) => {
        expect(existingSessionId).toBe("session-1");
        return {
          cleanup: () => {},
          initSession: () =>
            Promise.resolve({
              sessionId: "ignored",
              modes: {
                currentModeId: "balanced",
                availableModes: [{ id: "balanced", name: "Balanced" }],
              },
              models: {
                currentModelId: "gpt-5-codex",
                availableModels: [{ modelId: "gpt-5-codex", name: "GPT-5 Codex" }],
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
      command: "npx",
      args: ["-y", "@zed-industries/codex-acp"],
      cwd: sandboxDirectory,
      sessionId: "session-1",
      title: null,
      updatedAt: null,
    });

    const messages = await store2.listMessages("session-1");
    expect(messages).toEqual([
      expect.objectContaining({
        id: "message-row-1",
        role: "user",
        text: "prior turn",
      }),
    ]);
  });
});
