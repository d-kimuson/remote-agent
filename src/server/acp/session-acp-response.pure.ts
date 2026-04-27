import type {
  ModelInfo,
  NewSessionResponse,
  SessionConfigOption,
  SessionConfigSelectGroup,
  SessionConfigSelectOption,
  SessionConfigSelectOptions,
} from "@agentclientprotocol/sdk";

import type { ModeOption, ModelOption } from "../../shared/acp.ts";

const normalizeModelOptionId = (value: string): string => {
  const t = value.trim();
  return t.length > 0 ? t : "—";
};

export const mapModelInfoToModelOption = (model: ModelInfo): ModelOption => {
  const anyModel = model as { modelId?: string; id?: string };
  const id = model.modelId ?? anyModel.id ?? "";
  return {
    id: normalizeModelOptionId(String(id)),
    name: String(model.name),
    description: model.description ?? null,
  };
};

const isConfigSelectOption = (o: unknown): o is SessionConfigSelectOption => {
  if (o === null || typeof o !== "object" || !("value" in o) || !("name" in o)) {
    return false;
  }
  const t = o as { value: unknown; name: unknown };
  return typeof t.value === "string" && typeof t.name === "string";
};

const isConfigSelectGroup = (g: unknown): g is SessionConfigSelectGroup => {
  if (g === null || typeof g !== "object" || !("options" in g)) {
    return false;
  }
  const t = (g as { options: unknown }).options;
  return Array.isArray(t) && t.length > 0 && isConfigSelectOption(t[0] as unknown);
};

const flattenConfigSelectOptions = (
  raw: SessionConfigSelectOptions,
): readonly SessionConfigSelectOption[] => {
  if (raw.length === 0) {
    return [];
  }
  const first = raw[0] as unknown;
  if (isConfigSelectOption(first)) {
    return (raw as readonly unknown[]).filter((x: unknown): x is SessionConfigSelectOption =>
      isConfigSelectOption(x),
    );
  }
  if (isConfigSelectGroup(first)) {
    return (raw as readonly unknown[]).flatMap((g: unknown) =>
      isConfigSelectGroup(g) ? g.options : [],
    );
  }
  return [];
};

const isModelConfigOption = (c: SessionConfigOption): boolean => {
  if (c.type !== "select") {
    return false;
  }
  if (c.category === "model") {
    return true;
  }
  const id = c.id.toLowerCase();
  return id === "model";
};

const isModeConfigOption = (c: SessionConfigOption): boolean => {
  if (c.type !== "select") {
    return false;
  }
  if (c.category === "mode") {
    return true;
  }
  const id = c.id.toLowerCase();
  return id === "mode";
};

const readConfigSelects = (
  configOptions: NewSessionResponse["configOptions"] | null | undefined,
  pick: (c: SessionConfigOption) => boolean,
): { readonly options: ModelOption[]; readonly currentId: string | null } => {
  if (configOptions === null || configOptions === undefined) {
    return { options: [], currentId: null };
  }
  const selects: SessionConfigOption[] = (configOptions as readonly SessionConfigOption[]).filter(
    (c): c is SessionConfigOption => c.type === "select" && pick(c),
  );
  if (selects.length === 0) {
    return { options: [], currentId: null };
  }
  const seen = new Set<string>();
  const options: ModelOption[] = [];
  for (const s of selects) {
    for (const o of flattenConfigSelectOptions(s.options)) {
      const id = normalizeModelOptionId(o.value);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      options.push({
        id,
        name: o.name,
        description: o.description ?? null,
      });
    }
  }
  const currentVal = selects[0]?.currentValue;
  const currentId =
    currentVal !== null && currentVal !== undefined && String(currentVal).length > 0
      ? String(currentVal)
      : null;
  return { options, currentId };
};

export const buildModelOptionsFromResponse = (
  response: NewSessionResponse,
): {
  readonly options: ModelOption[];
  readonly currentModelId: string | null;
} => {
  const st = response.models;
  if (st !== null && st !== undefined && (st.availableModels?.length ?? 0) > 0) {
    return {
      options: (st.availableModels ?? []).map((m) => mapModelInfoToModelOption(m)),
      currentModelId: st.currentModelId ?? null,
    };
  }
  const fromConfig = readConfigSelects(response.configOptions, (c) => isModelConfigOption(c));
  if (fromConfig.options.length > 0) {
    return {
      options: fromConfig.options,
      currentModelId: fromConfig.currentId ?? st?.currentModelId ?? null,
    };
  }
  return {
    options: (st?.availableModels ?? []).map((m) => mapModelInfoToModelOption(m)),
    currentModelId: st?.currentModelId ?? null,
  };
};

export const buildModeOptionsFromResponse = (
  response: NewSessionResponse,
): {
  readonly options: ModeOption[];
  readonly currentModeId: string | null;
} => {
  const st = response.modes;
  if (st !== null && st !== undefined && (st.availableModes?.length ?? 0) > 0) {
    return {
      options: (st.availableModes ?? []).map((mode) => ({
        id: mode.id,
        name: mode.name,
        description: mode.description ?? null,
      })),
      currentModeId: st.currentModeId ?? null,
    };
  }
  const fromConfig = readConfigSelects(response.configOptions, (c) => isModeConfigOption(c));
  if (fromConfig.options.length > 0) {
    return {
      options: fromConfig.options.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
      })),
      currentModeId: fromConfig.currentId ?? st?.currentModeId ?? null,
    };
  }
  return {
    options: (st?.availableModes ?? []).map((mode) => ({
      id: mode.id,
      name: mode.name,
      description: mode.description ?? null,
    })),
    currentModeId: st?.currentModeId ?? null,
  };
};
