import type { AgentPreset } from '@/shared/acp';

export const agentPresets = [
  {
    id: 'codex',
    label: 'Codex',
    description: 'Official Codex ACP adapter.',
    command: 'codex-acp',
    args: [],
    modelSelectLabel: 'Model / Effort',
    modeSelectLabel: 'Sandbox',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    description: 'Claude Code ACP adapter.',
    command: 'claude-agent-acp',
    args: [],
    modelSelectLabel: 'Model',
    modeSelectLabel: 'Permission',
  },
  {
    id: 'copilot-cli',
    label: 'Copilot CLI',
    description: 'GitHub Copilot CLI ACP server.',
    command: 'copilot',
    args: ['--acp', '--stdio'],
    modelSelectLabel: 'Model',
    modeSelectLabel: 'Mode',
  },
  {
    id: 'pi-coding-agent',
    label: 'pi-coding-agent',
    description: 'pi-acp coding agent.',
    command: 'pi-acp',
    args: [],
    modelSelectLabel: 'Provider / Model',
    modeSelectLabel: 'Thinking',
  },
  {
    id: 'cursor-cli',
    label: 'Cursor CLI',
    description: 'Cursor Agent ACP server.',
    command: 'agent',
    args: ['acp'],
    modelSelectLabel: 'Model / Reasoning',
    modeSelectLabel: 'Mode',
  },
] as const satisfies readonly AgentPreset[];
