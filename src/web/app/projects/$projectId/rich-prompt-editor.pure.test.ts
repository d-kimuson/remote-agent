import { describe, expect, test } from "vitest";

import { applyRichPromptFormat, replaceRichPromptSelection } from "./rich-prompt-editor.pure.ts";

describe("rich-prompt-editor.pure", () => {
  test("wraps the selected text with inline markdown marks", () => {
    expect(
      applyRichPromptFormat({
        value: "hello world",
        selection: { start: 6, end: 11 },
        format: "bold",
      }),
    ).toEqual({
      value: "hello **world**",
      selection: { start: 8, end: 13 },
    });

    expect(
      applyRichPromptFormat({
        value: "hello world",
        selection: { start: 0, end: 5 },
        format: "code",
      }).value,
    ).toBe("`hello` world");
  });

  test("keeps the caret between inserted inline marks when there is no selection", () => {
    expect(
      applyRichPromptFormat({
        value: "hello",
        selection: { start: 5, end: 5 },
        format: "italic",
      }),
    ).toEqual({
      value: "hello__",
      selection: { start: 6, end: 6 },
    });
  });

  test("prefixes selected lines for list and quote formatting", () => {
    expect(
      applyRichPromptFormat({
        value: "first\nsecond\nthird",
        selection: { start: 7, end: 12 },
        format: "bulletList",
      }).value,
    ).toBe("first\n- second\nthird");

    expect(
      applyRichPromptFormat({
        value: "first\nsecond\nthird",
        selection: { start: 0, end: 12 },
        format: "quote",
      }).value,
    ).toBe("> first\n> second\nthird");
  });

  test("replaces the selected range and moves the caret after the inserted text", () => {
    expect(
      replaceRichPromptSelection({
        value: "hello world",
        selection: { start: 6, end: 11 },
        replacement: "agent",
      }),
    ).toEqual({
      value: "hello agent",
      selection: { start: 11, end: 11 },
    });
  });
});
