import AsyncStorage from '@react-native-async-storage/async-storage';
import { parse } from 'valibot';

import {
  connectionSettingsSchema,
  normalizeConnectionSettings,
  type ConnectionSettings,
} from '../../shared/connection-settings.pure.ts';

const connectionSettingsStorageKey = 'remote-agent.connection-settings';

export const loadConnectionSettings = async (): Promise<ConnectionSettings | null> => {
  const raw = await AsyncStorage.getItem(connectionSettingsStorageKey);
  if (raw === null) {
    return null;
  }

  const parsedJson: unknown = JSON.parse(raw);
  return normalizeConnectionSettings(parse(connectionSettingsSchema, parsedJson));
};

export const saveConnectionSettings = async (
  settings: ConnectionSettings,
): Promise<ConnectionSettings> => {
  const normalized = normalizeConnectionSettings(settings);
  await AsyncStorage.setItem(connectionSettingsStorageKey, JSON.stringify(normalized));
  return normalized;
};
