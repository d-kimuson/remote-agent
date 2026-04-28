import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FC,
  type PropsWithChildren,
} from "react";

import {
  defaultThemePreference,
  parseThemePreference,
  resolveThemePreference,
  themeStorageKey,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme.pure.ts";

type ThemeContextValue = {
  readonly preference: ThemePreference;
  readonly resolvedTheme: ResolvedTheme;
  readonly setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const getSystemPrefersDark = (): boolean => {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

const readStoredThemePreference = (): ThemePreference => {
  try {
    return parseThemePreference(window.localStorage.getItem(themeStorageKey));
  } catch {
    return defaultThemePreference;
  }
};

const persistThemePreference = (preference: ThemePreference): void => {
  try {
    window.localStorage.setItem(themeStorageKey, preference);
  } catch {
    // Ignore storage failures so theme changes still apply for the current tab.
  }
};

const applyResolvedTheme = (theme: ResolvedTheme): void => {
  document.documentElement.classList.toggle("dark", theme === "dark");
};

export const ThemeProvider: FC<PropsWithChildren> = ({ children }) => {
  const [preference, setPreferenceState] = useState(readStoredThemePreference);
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark);
  const resolvedTheme = resolveThemePreference(preference, systemPrefersDark);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
  }, []);

  useEffect(() => {
    const mediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemPreference = () => {
      setSystemPrefersDark(mediaQueryList.matches);
    };

    syncSystemPreference();
    mediaQueryList.addEventListener("change", syncSystemPreference);

    return () => {
      mediaQueryList.removeEventListener("change", syncSystemPreference);
    };
  }, []);

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    persistThemePreference(preference);
  }, [preference]);

  useEffect(() => {
    const syncStoredPreference = (event: StorageEvent) => {
      if (event.key === themeStorageKey) {
        setPreferenceState(parseThemePreference(event.newValue));
      }
    };

    window.addEventListener("storage", syncStoredPreference);
    return () => {
      window.removeEventListener("storage", syncStoredPreference);
    };
  }, []);

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      setPreference,
    }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);

  if (context === null) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
};
