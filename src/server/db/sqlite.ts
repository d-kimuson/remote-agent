import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { envService } from '../env.ts';
import * as schema from './schema.ts';

export const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../drizzle',
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
  defaultDatabase ??= createDatabase(envService.getEnv('REMOTE_AGENT_DB_PATH'));
  return defaultDatabase;
};

export const getStoragePath = (): string => {
  return getDefaultDatabase().storagePath;
};
