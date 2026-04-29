import { nullable, object, optional, parse, pipe, string, trim, type InferOutput } from 'valibot';

export const connectionSettingsSchema = object({
  serverUrl: pipe(string(), trim()),
  apiKey: nullable(optional(pipe(string(), trim()))),
});

export type ConnectionSettings = InferOutput<typeof connectionSettingsSchema>;

export const normalizeServerUrl = (value: string): string => value.trim().replace(/\/+$/g, '');

export const normalizeApiKey = (value: string | null | undefined): string | null => {
  const normalized = value?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
};

export const normalizeConnectionSettings = (settings: ConnectionSettings): ConnectionSettings =>
  parse(connectionSettingsSchema, {
    serverUrl: normalizeServerUrl(settings.serverUrl),
    apiKey: normalizeApiKey(settings.apiKey),
  });

export const connectionSettingsReady = (settings: ConnectionSettings): boolean =>
  normalizeServerUrl(settings.serverUrl).length > 0;

export const apiBaseUrlFromSettings = (settings: ConnectionSettings): string =>
  `${normalizeServerUrl(settings.serverUrl)}/api`;
