import { describe, expect, test } from "vitest";

import { distanceFromScrollBottom, isNearScrollBottom } from "./chat-scroll.pure.ts";

describe("chat scroll helpers", () => {
  test("computes distance from the bottom", () => {
    expect(
      distanceFromScrollBottom({ scrollHeight: 1_000, clientHeight: 300, scrollTop: 500 }),
    ).toBe(200);
  });

  test("treats near-bottom scroll positions as pinned", () => {
    expect(isNearScrollBottom({ scrollHeight: 1_000, clientHeight: 300, scrollTop: 620 })).toBe(
      true,
    );
    expect(isNearScrollBottom({ scrollHeight: 1_000, clientHeight: 300, scrollTop: 500 })).toBe(
      false,
    );
  });
});
