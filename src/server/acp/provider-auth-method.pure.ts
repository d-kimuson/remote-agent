import path from 'node:path';

import type { AgentPreset } from '../../shared/acp.ts';

const executableName = (command: string): string => path.basename(command).toLowerCase();

const hasAnyArg = (args: readonly string[], candidates: readonly string[]): boolean =>
  args.some((arg) => candidates.includes(arg));

export const inferAuthMethodIdFromCommand = ({
  args,
  command,
}: {
  readonly command: string;
  readonly args: readonly string[];
}): string | undefined => {
  const executable = executableName(command);

  if (executable === 'codex-acp' || hasAnyArg(args, ['codex-acp', '@zed-industries/codex-acp'])) {
    return 'chatgpt';
  }

  if (executable === 'copilot' && hasAnyArg(args, ['--acp'])) {
    return 'copilot-login';
  }

  if (executable === 'agent' && hasAnyArg(args, ['acp'])) {
    return 'cursor_login';
  }

  if (executable === 'opencode' && hasAnyArg(args, ['acp'])) {
    return 'opencode-login';
  }

  if (executable === 'pi-acp') {
    return 'pi_terminal_login';
  }

  return undefined;
};

export const resolveProviderAuthMethodId = (preset: AgentPreset | null): string | undefined => {
  if (preset === null) {
    return undefined;
  }

  return (
    preset.authMethodId ??
    inferAuthMethodIdFromCommand({ command: preset.command, args: preset.args })
  );
};
