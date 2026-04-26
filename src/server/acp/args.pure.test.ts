import { describe, expect, test } from "vitest";

import { parseArgsText } from "./args.pure";

describe("parseArgsText", () => {
  test("splits newline separated arguments", () => {
    expect(parseArgsText("--foo\nbar\nbaz")).toEqual(["--foo", "bar", "baz"]);
  });

  test("drops blank lines and trims spaces", () => {
    expect(parseArgsText("  --alpha  \n\n beta \n")).toEqual(["--alpha", "beta"]);
  });

  test("returns an empty list for undefined", () => {
    expect(parseArgsText(undefined)).toEqual([]);
  });
});
