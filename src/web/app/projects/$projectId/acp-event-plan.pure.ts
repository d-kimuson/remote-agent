import type { RawEvent } from "../../../../shared/acp.ts";

export type AcpToolMergeItem = {
  readonly type: "tool";
  readonly key: string;
  readonly toolCallId: string;
  readonly call: Extract<RawEvent, { type: "toolCall" }> | null;
  readonly result: Extract<RawEvent, { type: "toolResult" }> | null;
  readonly error: Extract<RawEvent, { type: "toolError" }> | null;
};

export type AcpEventPlanItem =
  | AcpToolMergeItem
  | { readonly type: "raw"; readonly key: string; readonly event: RawEvent };

type ToolAcc = {
  call: Extract<RawEvent, { type: "toolCall" }> | null;
  result: Extract<RawEvent, { type: "toolResult" }> | null;
  error: Extract<RawEvent, { type: "toolError" }> | null;
  min: number;
  max: number;
};

/**
 * 同一 toolCallId の call / result / error を1ブロックに束ね、**最後の tool 行**（同 id の max index）の位置に置く。
 * その前に推論や stream が挟まる場合はその順序を保つ（CCV の call→result 一体表示に相当）。
 */
export const planRawEventsForRender = (
  events: readonly RawEvent[],
): readonly AcpEventPlanItem[] => {
  const n = events.length;
  if (n === 0) {
    return [];
  }

  const byId = new Map<string, ToolAcc>();

  for (let i = 0; i < n; i += 1) {
    const e = events[i];
    if (e === undefined) {
      continue;
    }
    if (e.type === "toolCall" || e.type === "toolResult" || e.type === "toolError") {
      const id = e.toolCallId;
      const a: ToolAcc = byId.get(id) ?? {
        min: i,
        max: i,
        call: null,
        result: null,
        error: null,
      };
      const next: ToolAcc = {
        min: Math.min(a.min, i),
        max: Math.max(a.max, i),
        call: e.type === "toolCall" ? e : a.call,
        result: e.type === "toolResult" ? e : a.result,
        error: e.type === "toolError" ? e : a.error,
      };
      byId.set(id, next);
    }
  }

  const out: AcpEventPlanItem[] = [];
  for (let i = 0; i < n; i += 1) {
    const e = events[i];
    if (e === undefined) {
      continue;
    }
    if (e.type === "toolCall" || e.type === "toolResult" || e.type === "toolError") {
      const id = e.toolCallId;
      const a = byId.get(id);
      if (a === undefined || a.max !== i) {
        continue;
      }
      out.push({
        type: "tool",
        key: `tool-${id}`,
        toolCallId: id,
        call: a.call,
        result: a.result,
        error: a.error,
      });
    } else {
      out.push({ type: "raw", key: `raw-${i}-${e.type}`, event: e });
    }
  }

  return out;
};
