import { eq } from 'drizzle-orm';
import { parse } from 'valibot';

import { appSetupStateSchema, type AppSetupState } from '../../shared/acp.ts';
import { appSettingsTable } from '../db/schema.ts';
import { type AppDatabase, getDefaultDatabase } from '../db/sqlite.ts';

const initialSetupCompletedAtKey = 'initial_setup_completed_at';

const mapSetupCompletedAt = (completedAt: string | null): AppSetupState =>
  parse(appSetupStateSchema, {
    initialSetupCompleted: completedAt !== null,
    completedAt,
  });

export const createAppSetupStore = (database: AppDatabase = getDefaultDatabase()) => {
  const getSetupState = async (): Promise<AppSetupState> => {
    const [record] = await database.db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, initialSetupCompletedAtKey))
      .limit(1);

    return mapSetupCompletedAt(record?.value ?? null);
  };

  const markInitialSetupCompleted = async (): Promise<AppSetupState> => {
    const now = new Date().toISOString();
    await database.db
      .insert(appSettingsTable)
      .values({
        key: initialSetupCompletedAtKey,
        value: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: {
          value: now,
          updatedAt: now,
        },
      });

    return mapSetupCompletedAt(now);
  };

  return {
    getSetupState,
    markInitialSetupCompleted,
  };
};

let defaultAppSetupStore: ReturnType<typeof createAppSetupStore> | undefined = undefined;

const getAppSetupStore = () => {
  defaultAppSetupStore ??= createAppSetupStore();
  return defaultAppSetupStore;
};

export const getSetupState = async (): Promise<AppSetupState> => getAppSetupStore().getSetupState();

export const markInitialSetupCompleted = async (): Promise<AppSetupState> =>
  getAppSetupStore().markInitialSetupCompleted();
