export type AgentLaunchCommandInput = {
  readonly providerCommand: string;
  readonly providerArgs: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
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
}: AgentLaunchCommandInput): AgentLaunchCommand => ({
  command: providerCommand,
  args: [...providerArgs],
  cwd,
  env,
});
