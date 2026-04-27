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
      created_at TEXT NOT NULL,
      message_kind TEXT NOT NULL DEFAULT 'legacy_assistant_turn',
      stream_part_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_messages_session_id
      ON session_messages (session_id);

    CREATE INDEX IF NOT EXISTS idx_session_messages_created_at
      ON session_messages (created_at);
  `);

  migrateSessionMessagesV2(client);
};

const isTableInfoRow = (v: unknown): v is { readonly name: string } =>
  v !== null &&
  typeof v === "object" &&
  "name" in v &&
  typeof (v as { readonly name: unknown }).name === "string";

const hasColumn = (client: DatabaseSync, table: string, column: string): boolean => {
  const raw = client.prepare(`PRAGMA table_info(${table})`).all();
  const rows = Array.isArray(raw) ? raw.filter(isTableInfoRow) : [];
  return rows.some((r) => r.name === column);
};

const migrateSessionMessagesV2 = (client: DatabaseSync): void => {
  if (!hasColumn(client, "session_messages", "message_kind")) {
    client.exec(
      "ALTER TABLE session_messages ADD COLUMN message_kind TEXT NOT NULL DEFAULT 'legacy_assistant_turn';",
    );
    client.exec("UPDATE session_messages SET message_kind = 'user' WHERE role = 'user';");
  }
  if (!hasColumn(client, "session_messages", "stream_part_id")) {
    client.exec("ALTER TABLE session_messages ADD COLUMN stream_part_id TEXT;");
  }
  if (!hasColumn(client, "session_messages", "metadata_json")) {
    client.exec(
      "ALTER TABLE session_messages ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';",
    );
  }
  if (!hasColumn(client, "session_messages", "updated_at")) {
    client.exec("ALTER TABLE session_messages ADD COLUMN updated_at TEXT;");
    client.exec("UPDATE session_messages SET updated_at = created_at WHERE updated_at IS NULL");
  }

  client.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_session_messages_stream_part
    ON session_messages (session_id, stream_part_id)
    WHERE stream_part_id IS NOT NULL;
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
