import { SandboxManager, type SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import type {
  AgentPreset,
  AppSandboxSettings,
  ProjectSandboxSettings,
  SandboxRuleConfig,
} from '../../../shared/acp.ts';

import { getAppSettings } from '../../app-settings/app-settings-store.ts';
import { getProjectSettings } from '../../projects/project-store.ts';

export type SandboxLaunchConfig = {
  readonly mountDirectory: string;
  readonly sandboxedCommand: string;
};

const uniqueStrings = (values: readonly string[]): string[] => [
  ...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
];

const emptyProjectRules: ProjectSandboxSettings = {
  enabled: false,
  filesystem: {
    allowRead: [],
    denyRead: [],
    allowWrite: [],
    denyWrite: [],
  },
  network: {
    mode: 'none',
    allowedDomains: [],
  },
};

const shellQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

const commandLine = (command: string, args: readonly string[]): string =>
  [command, ...args].map(shellQuote).join(' ');

const resolveSandboxPath = (cwd: string, value: string): string => {
  if (value.startsWith('~') || path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(cwd, value);
};

const resolveSandboxPaths = (cwd: string, values: readonly string[]): readonly string[] =>
  values.map((value) => resolveSandboxPath(cwd, value));

let sandboxWrapQueue: Promise<void> = Promise.resolve();

const enqueueSandboxWrap = <T>(task: () => Promise<T>): Promise<T> => {
  const result = sandboxWrapQueue.then(task, task);
  sandboxWrapQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

const withProcessCwd = async <T>(cwd: string, task: () => Promise<T>): Promise<T> => {
  const previousCwd = process.cwd();
  process.chdir(cwd);
  try {
    return await task();
  } finally {
    process.chdir(previousCwd);
  }
};

const defaultRuntimeAllowReadPaths = [
  '~/.codex',
  '~/.pi',
  '~/.claude',
  '~/.github',
  '~/.copilot',
] as const;

const defaultRuntimeAllowedDomains = [
  'chatgpt.com',
  '*.chatgpt.com',
  'opencode.ai',
  '*.opencode.ai',
  'api.anthropic.com',
] as const;

const providerRuntimeAllowWritePaths = (presetId: string): readonly string[] => {
  switch (presetId) {
    case 'pi-coding-agent':
      return ['~/.pi'];
    case 'codex':
      return ['~/.codex'];
    default:
      return [];
  }
};

export const mergeSandboxRules = (
  globalRules: AppSandboxSettings,
  projectRules: ProjectSandboxSettings,
): SandboxRuleConfig => ({
  filesystem: {
    allowRead: uniqueStrings([
      ...globalRules.filesystem.allowRead,
      ...projectRules.filesystem.allowRead,
    ]),
    denyRead: uniqueStrings([
      ...globalRules.filesystem.denyRead,
      ...projectRules.filesystem.denyRead,
    ]),
    allowWrite: uniqueStrings([
      ...globalRules.filesystem.allowWrite,
      ...projectRules.filesystem.allowWrite,
    ]),
    denyWrite: uniqueStrings([
      ...globalRules.filesystem.denyWrite,
      ...projectRules.filesystem.denyWrite,
    ]),
  },
  network: {
    mode:
      projectRules.network.mode === 'inherit'
        ? globalRules.network.mode
        : projectRules.network.mode,
    allowedDomains: uniqueStrings([
      ...globalRules.network.allowedDomains,
      ...projectRules.network.allowedDomains,
    ]),
  },
});

export const shouldEnableSandbox = ({
  appSandbox,
  presetId,
  projectSandbox,
  sessionSandboxEnabled,
}: {
  readonly appSandbox: AppSandboxSettings;
  readonly presetId: string;
  readonly projectSandbox: ProjectSandboxSettings | null;
  readonly sessionSandboxEnabled: boolean | null | undefined;
}): boolean => {
  if (!appSandbox.enabledProviderIds.includes(presetId)) {
    return false;
  }

  return sessionSandboxEnabled ?? projectSandbox?.enabled ?? false;
};

const toSrtCustomConfig = (
  cwd: string,
  rules: SandboxRuleConfig,
): Partial<SandboxRuntimeConfig> => ({
  filesystem: {
    allowRead: [...resolveSandboxPaths(cwd, rules.filesystem.allowRead)],
    denyRead: [...resolveSandboxPaths(cwd, rules.filesystem.denyRead)],
    allowWrite: [...resolveSandboxPaths(cwd, rules.filesystem.allowWrite)],
    denyWrite: [...resolveSandboxPaths(cwd, rules.filesystem.denyWrite)],
  },
  ...(rules.network.mode === 'restrict'
    ? {
        network: {
          allowedDomains: [...rules.network.allowedDomains],
          deniedDomains: [],
        },
      }
    : {}),
});

const toSrtRuntimeConfig = (cwd: string, rules: SandboxRuleConfig): SandboxRuntimeConfig => ({
  filesystem: {
    allowRead: [...resolveSandboxPaths(cwd, rules.filesystem.allowRead)],
    denyRead: [...resolveSandboxPaths(cwd, rules.filesystem.denyRead)],
    allowWrite: [...resolveSandboxPaths(cwd, rules.filesystem.allowWrite)],
    denyWrite: [...resolveSandboxPaths(cwd, rules.filesystem.denyWrite)],
  },
  network: {
    allowedDomains: [...rules.network.allowedDomains],
    deniedDomains: [],
  },
});

const prepareNetworkSandboxRuntime = async (
  cwd: string,
  rules: SandboxRuleConfig,
): Promise<void> => {
  if (rules.network.mode !== 'restrict') {
    return;
  }

  const runtimeConfig = toSrtRuntimeConfig(cwd, rules);
  if (SandboxManager.getConfig() === undefined) {
    await SandboxManager.initialize(runtimeConfig);
    return;
  }

  SandboxManager.updateConfig(runtimeConfig);
};

export const resolveSandboxLaunchConfig = async ({
  args,
  command,
  cwd,
  preset,
  projectId,
  sessionSandboxEnabled,
}: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly preset: AgentPreset | null;
  readonly projectId: string | null;
  readonly sessionSandboxEnabled?: boolean | null;
}): Promise<SandboxLaunchConfig | null> => {
  if (preset === null) {
    return null;
  }

  const appSettings = await getAppSettings();
  const projectSandbox = projectId === null ? null : (await getProjectSettings(projectId)).sandbox;
  if (
    !shouldEnableSandbox({
      appSandbox: appSettings.sandbox,
      presetId: preset.id,
      projectSandbox,
      sessionSandboxEnabled,
    })
  ) {
    return null;
  }

  const mergedRules = mergeSandboxRules(appSettings.sandbox, projectSandbox ?? emptyProjectRules);
  const mountDirectory = path.join(homedir(), '.ra', 'mount', randomUUID());
  await mkdir(mountDirectory, { recursive: true });
  const rulesWithProviderRuntime: SandboxRuleConfig = {
    ...mergedRules,
    filesystem: {
      ...mergedRules.filesystem,
      allowRead: uniqueStrings([
        ...mergedRules.filesystem.allowRead,
        ...defaultRuntimeAllowReadPaths,
      ]),
      allowWrite: uniqueStrings([
        ...mergedRules.filesystem.allowWrite,
        ...providerRuntimeAllowWritePaths(preset.id),
      ]),
    },
    network: {
      ...mergedRules.network,
      allowedDomains: uniqueStrings([
        ...mergedRules.network.allowedDomains,
        ...defaultRuntimeAllowedDomains,
      ]),
    },
  };
  const wrappedCommand = await enqueueSandboxWrap(() =>
    withProcessCwd(mountDirectory, async () => {
      await prepareNetworkSandboxRuntime(cwd, rulesWithProviderRuntime);
      return SandboxManager.wrapWithSandbox(
        `cd ${shellQuote(cwd)} && ${commandLine(command, args)}`,
        undefined,
        toSrtCustomConfig(cwd, rulesWithProviderRuntime),
      );
    }),
  );
  const sandboxedCommand = `cd ${shellQuote(mountDirectory)} && ${wrappedCommand}`;

  return { mountDirectory, sandboxedCommand };
};
