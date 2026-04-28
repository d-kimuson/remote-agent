export type ChatScrollMetrics = {
  readonly scrollHeight: number;
  readonly scrollTop: number;
  readonly clientHeight: number;
};

export const CHAT_SCROLL_BOTTOM_THRESHOLD = 96;

export const distanceFromScrollBottom = ({
  clientHeight,
  scrollHeight,
  scrollTop,
}: ChatScrollMetrics): number => Math.max(0, scrollHeight - clientHeight - scrollTop);

export const isNearScrollBottom = (
  metrics: ChatScrollMetrics,
  threshold = CHAT_SCROLL_BOTTOM_THRESHOLD,
): boolean => distanceFromScrollBottom(metrics) <= threshold;
