import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { mkdirSync } from 'node:fs';
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
    return path.resolve(moduleDirectory, '../../../drizzle/migrations');
  }

  return moduleDirectory;
};

export const migrationsFolder = resolveMigrationsFolder(
  envService.getEnv('RA_RUNTIME'),
  path.dirname(fileURLToPath(import.meta.url)),
);

const resolveStoragePath = (storagePath: string): string => {
  if (storagePath === ':memory:') {
    return storagePath;
  }

  return path.resolve(storagePath);
};

export const createDatabase = (storagePath: string) => {
  const resolvedStoragePath = resolveStoragePath(storagePath);
  if (resolvedStoragePath !== ':memory:') {
    mkdirSync(path.dirname(resolvedStoragePath), { recursive: true });
  }

  const client = new DatabaseSync(resolvedStoragePath);
  client.exec('PRAGMA foreign_keys = ON;');
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
  defaultDatabase ??= createDatabase(resolve(envService.getEnv('RA_DIR'), 'data.sql'));
  return defaultDatabase;
};

export const getStoragePath = (): string => {
  return getDefaultDatabase().storagePath;
};
