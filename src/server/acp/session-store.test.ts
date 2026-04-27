import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { AgentPreset } from "../../shared/acp.ts";
import { createDatabase } from "../db/sqlite.ts";
import { createSessionStore } from "./session-store.ts";

const codexPreset: AgentPreset = {
  id: "codex",
  label: "Codex",
  description: "test preset",
  command: "npx",
  args: ["-y", "@zed-industries/codex-acp"],
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
        languageModel: () => {
          throw new Error("not used in this test");
        },
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
      isActive: true,
    });

    const activeSessions = await firstStore.listSessions();
    expect(activeSessions).toEqual([
      expect.objectContaining({
        sessionId: "session-1",
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
        languageModel: () => {
          throw new Error("not used in this test");
        },
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
        languageModel: () => {
          throw new Error("not used in this test");
        },
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
        languageModel: () => {
          throw new Error("not used in this test");
        },
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
          languageModel: () => {
            throw new Error("not used in this test");
          },
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
        isActive: false,
      }),
    ]);
  });
});
