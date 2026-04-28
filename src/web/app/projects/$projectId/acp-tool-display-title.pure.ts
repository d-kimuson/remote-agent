import type { RawEvent } from '../../../../shared/acp.ts';

/** @see @mcpc-tech/acp-ai-provider ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME */
const ACP_DYNAMIC_TOOL_FULL = 'acp.acp_provider_agent_dynamic_tool' as const;

const isAcpProviderDynamicToolName = (name: string): boolean =>
  name === ACP_DYNAMIC_TOOL_FULL || name.includes('acp_provider_agent_dynamic_tool');

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

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
    const tn = parsed['toolName'];
    if (typeof tn === 'string' && tn.trim().length > 0) {
      return tn.trim();
    }
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
  if (isAcpProviderDynamicToolName(outer) && ev.call !== null) {
    const inner = tryProviderAgentInputToolName(ev.call.inputText);
    if (inner !== null) {
      return inner;
    }
  }
  return outer;
};
