import type { ModeOption, ModelOption } from '../../../../shared/acp.ts';

type AcpSelectOption = ModeOption | ModelOption;
type AcpSelectKind = 'mode' | 'model';

const trimOrFallback = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

export const parseBracketAttributes = (value: string): ReadonlyMap<string, string> => {
  const start = value.indexOf('[');
  const end = value.lastIndexOf(']');
  if (start < 0 || end <= start) {
    return new Map();
  }

  const entries: readonly (readonly [string, string])[] = value
    .slice(start + 1, end)
    .split(',')
    .flatMap((entry) => {
      const [key, ...rest] = entry.split('=');
      const k = key?.trim() ?? '';
      const v = rest.join('=').trim();
      if (k.length === 0 || v.length === 0) {
        return [];
      }
      const pair: readonly [string, string] = [k, v];
      return [pair];
    });

  return new Map(entries);
};

const bracketAttributeLabels = (value: string): readonly string[] => {
  const attrs = parseBracketAttributes(value);
  return [...attrs.entries()].map(([key, v]) => `${key}=${v}`);
};

export const formatAcpSelectOptionInfo = ({
  kind,
  option,
  presetId,
}: {
  readonly kind: AcpSelectKind;
  readonly option: AcpSelectOption;
  readonly presetId: string | null | undefined;
}): string | null => {
  if (presetId !== 'cursor-cli' || kind !== 'model') {
    return null;
  }

  const labels = bracketAttributeLabels(option.id);
  return labels.length > 0 ? labels.join('\n') : null;
};

const hasDuplicateName = (option: AcpSelectOption, options: readonly AcpSelectOption[]): boolean =>
  options.filter((candidate) => candidate.name === option.name).length > 1;

export const formatAcpSelectOptionLabel = ({
  kind,
  option,
  options,
  presetId,
}: {
  readonly kind: AcpSelectKind;
  readonly option: AcpSelectOption;
  readonly options: readonly AcpSelectOption[];
  readonly presetId: string | null | undefined;
}): string => {
  const base = trimOrFallback(option.name, option.id);
  if (presetId === 'cursor-cli' && kind === 'model') {
    return base;
  }
  if (hasDuplicateName(option, options) && option.id !== base) {
    return `${base} · ${option.id}`;
  }
  return base;
};

export const formatAcpSelectValueLabel = ({
  fallback,
  kind,
  options,
  presetId,
  value,
}: {
  readonly fallback: string;
  readonly kind: AcpSelectKind;
  readonly options: readonly AcpSelectOption[];
  readonly presetId: string | null | undefined;
  readonly value: unknown;
}): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const option = options.find((candidate) => candidate.id === value);
  if (option === undefined) {
    return value;
  }

  return formatAcpSelectOptionLabel({ kind, option, options, presetId });
};

export const formatAcpSelectValueInfo = ({
  kind,
  options,
  presetId,
  value,
}: {
  readonly kind: AcpSelectKind;
  readonly options: readonly AcpSelectOption[];
  readonly presetId: string | null | undefined;
  readonly value: unknown;
}): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const option = options.find((candidate) => candidate.id === value);
  if (option === undefined) {
    return null;
  }

  return formatAcpSelectOptionInfo({ kind, option, presetId });
};
