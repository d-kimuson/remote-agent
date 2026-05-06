export type AgentLaunchCommandInput = {
  readonly providerCommand: string;
  readonly providerArgs: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly sandbox?: {
    readonly sandboxedCommand: string;
  } | null;
};

export type AgentLaunchCommand = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
};

export const buildAgentLaunchCommand = ({
  providerCommand,
  providerArgs,
  cwd,
  env,
  sandbox,
}: AgentLaunchCommandInput): AgentLaunchCommand => {
  if (sandbox !== null && sandbox !== undefined) {
    return {
      command: process.platform === 'win32' ? (process.env['ComSpec'] ?? 'cmd.exe') : 'bash',
      args:
        process.platform === 'win32'
          ? ['/d', '/s', '/c', sandbox.sandboxedCommand]
          : ['-lc', sandbox.sandboxedCommand],
      cwd,
      env,
    };
  }

  return {
    command: providerCommand,
    args: [...providerArgs],
    cwd,
    env,
  };
};
