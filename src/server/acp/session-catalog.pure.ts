import type { ModeOption, ModelOption } from "../../shared/acp.ts";

/**
 * loaded セッションなどで ACP が currentId だけ返し available* カタログが空のとき、
 * UI・createSession のテンプレ解決用に最低 1 件のオプションを補う。
 */
export const enrichModelOptionsIfEmpty = (
  options: readonly ModelOption[],
  currentModelId: string | null | undefined,
): ModelOption[] => {
  if (options.length > 0) {
    return [...options];
  }
  if (
    currentModelId === null ||
    currentModelId === undefined ||
    currentModelId.trim().length === 0
  ) {
    return [...options];
  }
  return [{ id: currentModelId, name: currentModelId, description: null }];
};

export const enrichModeOptionsIfEmpty = (
  options: readonly ModeOption[],
  currentModeId: string | null | undefined,
): ModeOption[] => {
  if (options.length > 0) {
    return [...options];
  }
  if (currentModeId === null || currentModeId === undefined || currentModeId.trim().length === 0) {
    return [...options];
  }
  return [{ id: currentModeId, name: currentModeId, description: null }];
};
