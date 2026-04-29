import {
  array,
  literal,
  nullable,
  number,
  object,
  optional,
  safeParse,
  string,
  union,
  type InferOutput,
} from 'valibot';

import type { ChatMessage, SlashCommand } from '../../../../shared/acp.ts';

const costSchema = object({
  amount: number(),
  currency: string(),
});

const usageUpdateSchema = object({
  sessionUpdate: literal('usage_update'),
  used: number(),
  size: number(),
  cost: optional(nullable(costSchema)),
});

const availableCommandSchema = object({
  name: string(),
  description: string(),
  input: optional(
    nullable(
      object({
        hint: string(),
      }),
    ),
  ),
});

const availableCommandsUpdateSchema = object({
  sessionUpdate: literal('available_commands_update'),
  availableCommands: array(availableCommandSchema),
});

const sessionInfoUpdateSchema = object({
  sessionUpdate: literal('session_info_update'),
  title: optional(nullable(string())),
  updatedAt: optional(nullable(string())),
});

const toolLocationSchema = object({
  path: string(),
  line: optional(nullable(number())),
});

const toolStatusUpdateSchema = object({
  sessionUpdate: union([literal('tool_call'), literal('tool_call_update')]),
  toolCallId: string(),
  title: optional(nullable(string())),
  kind: optional(nullable(string())),
  status: optional(nullable(string())),
  locations: optional(nullable(array(toolLocationSchema))),
});

const acpMetadataSchema = object({
  acpSessionUpdate: union([
    usageUpdateSchema,
    availableCommandsUpdateSchema,
    sessionInfoUpdateSchema,
    toolStatusUpdateSchema,
  ]),
});

export type AcpUsageUpdate = InferOutput<typeof usageUpdateSchema>;
export type AcpSessionInfoUpdate = InferOutput<typeof sessionInfoUpdateSchema>;
export type AcpToolStatusUpdate = InferOutput<typeof toolStatusUpdateSchema>;

type AcpSessionUpdate = InferOutput<typeof acpMetadataSchema>['acpSessionUpdate'];

type JsonParseResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

const parseJson = (text: string): JsonParseResult => {
  if (text.trim().length === 0) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};

export const acpSessionUpdateFromMessage = (message: ChatMessage): AcpSessionUpdate | null => {
  if ((message.kind ?? null) !== 'raw_meta' || message.metadataJson === null) {
    return null;
  }
  const value = parseJson(message.metadataJson ?? '');
  if (!value.ok) {
    return null;
  }
  const parsed = safeParse(acpMetadataSchema, value.value);
  return parsed.success ? parsed.output.acpSessionUpdate : null;
};

export const latestAcpUsageUpdate = (messages: readonly ChatMessage[]): AcpUsageUpdate | null => {
  for (const message of messages.toReversed()) {
    const update = acpSessionUpdateFromMessage(message);
    if (update?.sessionUpdate === 'usage_update') {
      return update;
    }
  }
  return null;
};

export const latestAvailableSlashCommands = (
  messages: readonly ChatMessage[],
): readonly SlashCommand[] => {
  for (const message of messages.toReversed()) {
    const update = acpSessionUpdateFromMessage(message);
    if (update?.sessionUpdate === 'available_commands_update') {
      return update.availableCommands.map((command) => ({
        name: command.name,
        description: command.description,
        inputHint: command.input?.hint ?? null,
      }));
    }
  }
  return [];
};

export const acpToolStatusUpdateFromMessage = (
  message: ChatMessage,
): AcpToolStatusUpdate | null => {
  const update = acpSessionUpdateFromMessage(message);
  return update?.sessionUpdate === 'tool_call' || update?.sessionUpdate === 'tool_call_update'
    ? update
    : null;
};

export const vscodeFileUri = ({
  cwd,
  line,
  path,
}: {
  readonly cwd?: string | null;
  readonly path: string;
  readonly line: number | null | undefined;
}): string => {
  const suffix = line === null || line === undefined ? '' : `:${String(line)}`;
  const filePath = absoluteToolLocationPath({ cwd, path });
  return `vscode://file/${encodeVscodeFilePath(filePath)}${suffix}`;
};

const isAbsoluteToolLocationPath = (path: string): boolean =>
  path.startsWith('/') || path.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(path);

const absoluteToolLocationPath = ({
  cwd,
  path,
}: {
  readonly cwd?: string | null;
  readonly path: string;
}): string => {
  if (isAbsoluteToolLocationPath(path) || cwd === null || cwd === undefined || cwd.length === 0) {
    return path;
  }

  return `${cwd.replace(/[\\/]+$/, '')}/${path.replace(/^[\\/]+/, '')}`;
};

const encodeVscodeFilePath = (path: string): string =>
  path
    .replaceAll('\\', '/')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
