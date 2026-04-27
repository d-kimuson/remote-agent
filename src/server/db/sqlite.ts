import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/node-sqlite";

import { envService } from "../env.ts";
import * as schema from "./schema.ts";

const initializeSchema = (client: DatabaseSync): void => {
  client.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      working_directory TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_created_at
      ON projects (created_at);

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY NOT NULL,
      origin TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE,
      preset_id TEXT,
      command TEXT NOT NULL,
      args_json TEXT NOT NULL,
      cwd TEXT NOT NULL,
      created_at TEXT NOT NULL,
      title TEXT,
      updated_at TEXT,
      current_mode_id TEXT,
      current_model_id TEXT,
      available_modes_json TEXT NOT NULL,
      available_models_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_created_at
      ON sessions (created_at);

    CREATE INDEX IF NOT EXISTS idx_sessions_project_id
      ON sessions (project_id);

    CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE ON UPDATE CASCADE,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      raw_events_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_messages_session_id
      ON session_messages (session_id);

    CREATE INDEX IF NOT EXISTS idx_session_messages_created_at
      ON session_messages (created_at);
  `);
};

const resolveStoragePath = (storagePath: string): string => {
  if (storagePath === ":memory:") {
    return storagePath;
  }

  return path.resolve(storagePath);
};

export const createDatabase = (storagePath: string) => {
  const resolvedStoragePath = resolveStoragePath(storagePath);
  if (resolvedStoragePath !== ":memory:") {
    mkdirSync(path.dirname(resolvedStoragePath), { recursive: true });
  }

  const client = new DatabaseSync(resolvedStoragePath);
  initializeSchema(client);

  return {
    client,
    db: drizzle({ client, schema }),
    storagePath: resolvedStoragePath,
  };
};

export type AppDatabase = ReturnType<typeof createDatabase>;

export const createMemoryDatabase = (): AppDatabase => {
  return createDatabase(":memory:");
};

let defaultDatabase: AppDatabase | undefined = undefined;

export const getDefaultDatabase = (): AppDatabase => {
  defaultDatabase ??= createDatabase(envService.getEnv("ACP_PLAYGROUND_DB_PATH"));
  return defaultDatabase;
};

export const getStoragePath = (): string => {
  return getDefaultDatabase().storagePath;
};
