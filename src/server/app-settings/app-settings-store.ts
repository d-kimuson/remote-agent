import { eq } from 'drizzle-orm';
import { parse, safeParse } from 'valibot';

import {
  appSettingsSchema,
  appLanguageSchema,
  appSubmitKeyBindingSchema,
  type AppSettings,
  type AppLanguage,
  type AppSubmitKeyBinding,
  type UpdateAppSettingsRequest,
} from '../../shared/acp.ts';
import { appSettingsTable } from '../db/schema.ts';
import { type AppDatabase, getDefaultDatabase } from '../db/sqlite.ts';

const submitKeyBindingKey = 'submit_key_binding';
const languageKey = 'language';
const defaultSubmitKeyBinding: AppSubmitKeyBinding = 'mod-enter';
const defaultLanguage: AppLanguage = 'ja';

const parseStoredSubmitKeyBinding = (value: string | null | undefined): AppSubmitKeyBinding => {
  const parsed = safeParse(appSubmitKeyBindingSchema, value);
  return parsed.success ? parsed.output : defaultSubmitKeyBinding;
};

const parseStoredLanguage = (value: string | null | undefined): AppLanguage => {
  const parsed = safeParse(appLanguageSchema, value);
  return parsed.success ? parsed.output : defaultLanguage;
};

export const createAppSettingsStore = (database: AppDatabase = getDefaultDatabase()) => {
  const getSettings = async (): Promise<AppSettings> => {
    const records = await database.db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, submitKeyBindingKey));
    const [languageRecord] = await database.db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, languageKey))
      .limit(1);

    return parse(appSettingsSchema, {
      language: parseStoredLanguage(languageRecord?.value),
      submitKeyBinding: parseStoredSubmitKeyBinding(records.at(0)?.value),
    });
  };

  const updateSettings = async (request: UpdateAppSettingsRequest): Promise<AppSettings> => {
    const now = new Date().toISOString();
    await database.db
      .insert(appSettingsTable)
      .values({
        key: languageKey,
        value: request.language,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: {
          value: request.language,
          updatedAt: now,
        },
      });
    await database.db
      .insert(appSettingsTable)
      .values({
        key: submitKeyBindingKey,
        value: request.submitKeyBinding,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: {
          value: request.submitKeyBinding,
          updatedAt: now,
        },
      });

    return getSettings();
  };

  return {
    getSettings,
    updateSettings,
  };
};

let defaultAppSettingsStore: ReturnType<typeof createAppSettingsStore> | undefined = undefined;

const getAppSettingsStore = () => {
  defaultAppSettingsStore ??= createAppSettingsStore();
  return defaultAppSettingsStore;
};

export const getAppSettings = async (): Promise<AppSettings> => getAppSettingsStore().getSettings();

export const updateAppSettings = async (request: UpdateAppSettingsRequest): Promise<AppSettings> =>
  getAppSettingsStore().updateSettings(request);
