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
}: AgentLaunchCommandInput): AgentLaunchCommand =>
  sandbox === null || sandbox === undefined
    ? {
        command: providerCommand,
        args: [...providerArgs],
        cwd,
        env,
      }
    : {
        command: '/usr/bin/env',
        args: ['bash', '-lc', sandbox.sandboxedCommand],
        cwd,
        env,
      };
