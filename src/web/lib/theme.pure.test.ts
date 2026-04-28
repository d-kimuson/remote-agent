import { describe, expect, test } from "vitest";

import {
  defaultThemePreference,
  parseThemePreference,
  resolveThemePreference,
} from "./theme.pure.ts";

describe("parseThemePreference", () => {
  test("accepts supported theme preferences", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
  });

  test("falls back to the default for missing or corrupted storage values", () => {
    expect(parseThemePreference(null)).toBe(defaultThemePreference);
    expect(parseThemePreference("auto")).toBe(defaultThemePreference);
    expect(parseThemePreference("")).toBe(defaultThemePreference);
  });
});

describe("resolveThemePreference", () => {
  test("resolves explicit light and dark preferences independently of the system setting", () => {
    expect(resolveThemePreference("light", true)).toBe("light");
    expect(resolveThemePreference("light", false)).toBe("light");
    expect(resolveThemePreference("dark", true)).toBe("dark");
    expect(resolveThemePreference("dark", false)).toBe("dark");
  });

  test("resolves system preference from prefers-color-scheme", () => {
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");
  });
});
