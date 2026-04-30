import type { RawEvent } from '../../../../shared/acp.ts';

/** @see @mcpc-tech/acp-ai-provider ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME */
const ACP_DYNAMIC_TOOL_FULL = 'acp.acp_provider_agent_dynamic_tool' as const;

const isAcpProviderDynamicToolName = (name: string): boolean =>
  name === ACP_DYNAMIC_TOOL_FULL || name.includes('acp_provider_agent_dynamic_tool');

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const stringField = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const commandField = (record: Record<string, unknown>): string | null => {
  const command = record['command'];
  if (typeof command === 'string' && command.trim().length > 0) {
    return command.trim();
  }
  if (Array.isArray(command)) {
    const parts = command.filter((part) => typeof part === 'string');
    const last = parts.at(-1);
    return last === undefined || last.trim().length === 0 ? null : last.trim();
  }
  return null;
};

const truncateTitleCommand = (command: string): string =>
  command.length > 72 ? `${command.slice(0, 64)}...` : command;

const isPathTitleToolName = (toolName: string): boolean =>
  toolName === 'edit' || toolName === 'read';

const pathTitle = (toolName: string, args: unknown): string | null => {
  if (!isPathTitleToolName(toolName) || !isRecord(args)) {
    return null;
  }

  const path = stringField(args, 'path');
  return path === null ? null : `${toolName}: ${path}`;
};

const displayToolName = (toolName: string, args: unknown): string => {
  const titleWithPath = pathTitle(toolName, args);
  if (titleWithPath !== null) {
    return titleWithPath;
  }

  if (toolName !== 'bash' || !isRecord(args)) {
    return toolName;
  }

  const command = commandField(args);
  return command === null || command === toolName
    ? toolName
    : `${toolName}: ${truncateTitleCommand(command)}`;
};

const tryProviderAgentInputToolName = (inputText: string): string | null => {
  const t = inputText.trim();
  if (t.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(t);
    if (!isRecord(parsed)) {
      return null;
    }
    const directToolName = stringField(parsed, 'toolName');
    if (directToolName !== null && !isAcpProviderDynamicToolName(directToolName)) {
      return displayToolName(directToolName, parsed['args']);
    }
    const input = parsed['input'];
    if (isRecord(input)) {
      const nestedToolName = stringField(input, 'toolName');
      if (nestedToolName !== null) {
        return displayToolName(nestedToolName, input['args']);
      }
    }
    return directToolName === null ? null : displayToolName(directToolName, parsed['args']);
  } catch {
    /* 非 JSON */
  }
  return null;
};

/**
 * プロトコル上は常に `acp…dynamic_tool` だが、入力 JSON には実際の `toolName`（ProviderAgentDynamicToolInput）が入る。
 * 取れたときはそちらを、取れなければイベントの `toolName`。
 */
export const resolveAcpToolCardTitle = (ev: {
  readonly call: Extract<RawEvent, { type: 'toolCall' }> | null;
  readonly result: Extract<RawEvent, { type: 'toolResult' }> | null;
  readonly error: Extract<RawEvent, { type: 'toolError' }> | null;
}): string => {
  const outer = ev.call?.toolName ?? ev.result?.toolName ?? ev.error?.toolName ?? 'tool';
  if (isAcpProviderDynamicToolName(outer)) {
    const candidates = [
      ev.call?.inputText,
      ev.call?.rawText,
      ev.result?.rawText,
      ev.error?.rawText,
    ].filter((text) => text !== undefined);
    for (const candidate of candidates) {
      const inner = tryProviderAgentInputToolName(candidate);
      if (inner !== null) {
        return inner;
      }
    }
  }
  return outer;
};
