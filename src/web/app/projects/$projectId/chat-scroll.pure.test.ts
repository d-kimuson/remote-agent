import { describe, expect, test } from "vitest";

import {
  distanceFromScrollBottom,
  isNearScrollBottom,
  nextUnreadMessageCount,
} from "./chat-scroll.pure.ts";

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

  test("resets unread count while following the bottom", () => {
    expect(
      nextUnreadMessageCount({
        currentUnreadCount: 3,
        isFollowingTail: true,
        nextMessageCount: 10,
        previousMessageCount: 8,
      }),
    ).toBe(0);
  });

  test("adds only newly appended messages while not following the bottom", () => {
    expect(
      nextUnreadMessageCount({
        currentUnreadCount: 2,
        isFollowingTail: false,
        nextMessageCount: 7,
        previousMessageCount: 4,
      }),
    ).toBe(5);
    expect(
      nextUnreadMessageCount({
        currentUnreadCount: 2,
        isFollowingTail: false,
        nextMessageCount: 3,
        previousMessageCount: 4,
      }),
    ).toBe(2);
  });

  test("does not carry a negative unread count into the next value", () => {
    expect(
      nextUnreadMessageCount({
        currentUnreadCount: -2,
        isFollowingTail: false,
        nextMessageCount: 5,
        previousMessageCount: 4,
      }),
    ).toBe(1);
  });
});
