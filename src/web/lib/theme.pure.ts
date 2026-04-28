export type ThemePreference = 'light' | 'dark' | 'system';

export type ResolvedTheme = 'light' | 'dark';

export const themeStorageKey = 'acp-playground:theme';

export const defaultThemePreference = 'system' satisfies ThemePreference;

export const themePreferences = [
  'light',
  'dark',
  'system',
] as const satisfies readonly ThemePreference[];

export const parseThemePreference = (value: string | null): ThemePreference => {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : defaultThemePreference;
};

export const resolveThemePreference = (
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme => {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }

  return preference;
};
