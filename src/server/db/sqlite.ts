import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path, { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { envService, type Env } from '../env.ts';
import * as schema from './schema.ts';

export const resolveMigrationsFolder = (
  runtime: Env['RA_RUNTIME'],
  moduleDirectory: string,
): string => {
  if (runtime === 'dev') {
    return path.resolve(moduleDirectory, '../../../drizzle');
  }

  return moduleDirectory;
};

export const migrationsFolder = resolveMigrationsFolder(
  envService.getEnv('RA_RUNTIME'),
  path.dirname(fileURLToPath(import.meta.url)),
);
const migrationsRootFolder = path.join(migrationsFolder, 'migrations');

const migrationsTable = '__drizzle_migrations';

const tableExists = (client: DatabaseSync, table: string): boolean => {
  return (
    client.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !==
    undefined
  );
};

const columnExists = (client: DatabaseSync, table: string, column: string): boolean => {
  return (
    client.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column) !==
    undefined
  );
};

const indexExists = (client: DatabaseSync, indexName: string): boolean => {
  return (
    client
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get(indexName) !== undefined
  );
};

const ensureMigrationsTable = (client: DatabaseSync): void => {
  client.exec(`
    CREATE TABLE IF NOT EXISTS ${migrationsTable} (
      id INTEGER PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric,
      name text,
      applied_at TEXT
    );
  `);
};

const insertAppliedMigration = (
  client: DatabaseSync,
  migration: {
    readonly hash: string;
    readonly folderMillis: number;
    readonly name: string;
  },
): void => {
  client
    .prepare(
      `
        INSERT INTO ${migrationsTable} ("hash", "created_at", "name", "applied_at")
        SELECT ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM ${migrationsTable} WHERE name = ?
        );
      `,
    )
    .run(
      migration.hash,
      migration.folderMillis,
      migration.name,
      new Date().toISOString(),
      migration.name,
    );
};

const baselineLegacyMigrations = (client: DatabaseSync): void => {
  if (!tableExists(client, 'projects')) {
    return;
  }

  ensureMigrationsTable(client);

  const migrations = readMigrationFiles({ migrationsFolder });
  const appliedMigrationNames = new Set([
    '20260427002242_confused_cerebro',
    ...(tableExists(client, 'session_messages') ? ['20260427012306_flimsy_tiger_shark'] : []),
    ...(tableExists(client, 'enabled_agent_providers') &&
    tableExists(client, 'agent_provider_catalogs') &&
    columnExists(client, 'session_messages', 'updated_at') &&
    indexExists(client, 'idx_session_messages_stream_part')
      ? ['20260428093817_noisy_toro']
      : []),
    ...(tableExists(client, 'project_model_preferences')
      ? ['20260428093917_common_squirrel_girl']
      : []),
  ]);

  for (const migration of migrations) {
    if (appliedMigrationNames.has(migration.name)) {
      insertAppliedMigration(client, migration);
    }
  }
};

const resolveStoragePath = (storagePath: string): string => {
  if (storagePath === ':memory:') {
    return storagePath;
  }

  return path.resolve(storagePath);
};

const listSqlMigrationFiles = (): readonly string[] => {
  try {
    return readdirSync(migrationsRootFolder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(migrationsRootFolder, entry.name, 'migration.sql'))
      .filter((filePath) => {
        try {
          return readFileSync(filePath, 'utf8').length > 0;
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
};

const hasManagedTables = (client: DatabaseSync): boolean => {
  return ['projects', 'sessions', 'session_messages', 'enabled_agent_providers'].some((table) =>
    tableExists(client, table),
  );
};

const applySqlMigrationsFallback = (client: DatabaseSync): void => {
  if (hasManagedTables(client)) {
    return;
  }

  const sqlMigrationFiles = listSqlMigrationFiles();
  if (sqlMigrationFiles.length === 0) {
    return;
  }

  for (const filePath of sqlMigrationFiles) {
    client.exec(readFileSync(filePath, 'utf8'));
  }
};

const ensureRuntimeSchemaCompatibility = (client: DatabaseSync): void => {
  client.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at text NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routines (
      id text PRIMARY KEY,
      name text NOT NULL,
      enabled text NOT NULL,
      kind text NOT NULL,
      config_json text NOT NULL,
      send_config_json text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL,
      last_run_at text,
      next_run_at text,
      last_error text
    );

    CREATE INDEX IF NOT EXISTS idx_routines_enabled_next_run_at
      ON routines (enabled, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_routines_updated_at
      ON routines (updated_at);

    CREATE TABLE IF NOT EXISTS project_mode_preferences (
      project_id text NOT NULL REFERENCES projects(id)
        ON DELETE cascade
        ON UPDATE cascade,
      preset_id text NOT NULL,
      mode_id text NOT NULL,
      last_used_at text,
      updated_at text NOT NULL,
      PRIMARY KEY (project_id, preset_id, mode_id)
    );

    CREATE INDEX IF NOT EXISTS idx_project_mode_preferences_project_preset
      ON project_mode_preferences (project_id, preset_id);
    CREATE INDEX IF NOT EXISTS idx_project_mode_preferences_last_used
      ON project_mode_preferences (last_used_at);

    CREATE TABLE IF NOT EXISTS custom_agent_providers (
      id text PRIMARY KEY,
      name text NOT NULL,
      command text NOT NULL,
      args_json text NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_agent_providers_name
      ON custom_agent_providers (name);
    CREATE INDEX IF NOT EXISTS idx_custom_agent_providers_updated_at
      ON custom_agent_providers (updated_at);

  `);

  if (tableExists(client, 'sessions') && !columnExists(client, 'sessions', 'config_options_json')) {
    client.exec("ALTER TABLE sessions ADD COLUMN config_options_json text NOT NULL DEFAULT '[]';");
  }

  if (
    tableExists(client, 'projects') &&
    !columnExists(client, 'projects', 'worktree_setup_script')
  ) {
    client.exec("ALTER TABLE projects ADD COLUMN worktree_setup_script text NOT NULL DEFAULT '';");
  }
};

export const createDatabase = (storagePath: string) => {
  const resolvedStoragePath = resolveStoragePath(storagePath);
  if (resolvedStoragePath !== ':memory:') {
    mkdirSync(path.dirname(resolvedStoragePath), { recursive: true });
  }

  const client = new DatabaseSync(resolvedStoragePath);
  client.exec('PRAGMA foreign_keys = ON;');
  baselineLegacyMigrations(client);
  applySqlMigrationsFallback(client);
  const db = drizzle({ client, schema });
  migrate(db, { migrationsFolder });
  ensureRuntimeSchemaCompatibility(client);

  return {
    client,
    db,
    storagePath: resolvedStoragePath,
  };
};

export type AppDatabase = ReturnType<typeof createDatabase>;

export const createMemoryDatabase = (): AppDatabase => {
  return createDatabase(':memory:');
};

let defaultDatabase: AppDatabase | undefined = undefined;

export const getDefaultDatabase = (): AppDatabase => {
  defaultDatabase ??= createDatabase(resolve(envService.getEnv('RA_DIR'), 'data.sql'));
  return defaultDatabase;
};

export const getStoragePath = (): string => {
  return getDefaultDatabase().storagePath;
};
