import { createACPProvider } from '@mcpc-tech/acp-ai-provider';

import type { ModeOption, ModelOption } from '../../../shared/acp.ts';

import { resolveAuthMethodIdForPresetId } from '../preset-auth-method-id.pure.ts';
import { agentPresets } from '../presets.ts';
import {
  buildModelOptionsFromResponse,
  buildModeOptionsFromResponse,
} from '../session-acp-response.pure.ts';
import { enrichModeOptionsIfEmpty, enrichModelOptionsIfEmpty } from '../session-catalog.pure.ts';
import { buildAgentLaunchCommand } from './agent-launch-command.pure.ts';
import { buildAgentProcessEnv } from './agent-process-env.ts';
import { resolveCommandPath } from './command-path.ts';

export type AgentModelCatalog = {
  readonly availableModels: readonly ModelOption[];
  readonly availableModes: readonly ModeOption[];
  readonly currentModelId: string | null;
  readonly currentModeId: string | null;
};

/**
 * DB や永続セッションを作らず、エージェントに一度つないで `initSession` しモデル/モード一覧を得る。
 * セッション 0 件のプロジェクトでもプレースホルダ UI を避けられる。
 */
export const probeAgentModelCatalog = async (options: {
  readonly cwd: string;
  readonly presetId: string;
}): Promise<AgentModelCatalog> => {
  const preset = agentPresets.find((p) => p.id === options.presetId) ?? agentPresets[0];
  if (preset === undefined) {
    throw new Error('agentPresets must not be empty');
  }

  const resolvedCommandPath = await resolveCommandPath(preset.command);
  if (resolvedCommandPath === null) {
    throw new Error(
      `Command not found on PATH: ${preset.command}. Install the ${preset.label} ACP adapter first.`,
    );
  }

  const launch = buildAgentLaunchCommand({
    providerCommand: resolvedCommandPath,
    providerArgs: preset.args,
    cwd: options.cwd,
    env: buildAgentProcessEnv(),
  });

  const provider = createACPProvider({
    command: launch.command,
    args: [...launch.args],
    authMethodId: resolveAuthMethodIdForPresetId(preset.id),
    env: launch.env,
    session: {
      cwd: launch.cwd,
      mcpServers: [],
    },
    persistSession: false,
  });

  try {
    provider.languageModel();
    const response = await provider.initSession(provider.tools ?? {});
    const models = buildModelOptionsFromResponse(response);
    const modes = buildModeOptionsFromResponse(response);
    return {
      availableModels: enrichModelOptionsIfEmpty(models.options, models.currentModelId),
      availableModes: enrichModeOptionsIfEmpty(modes.options, modes.currentModeId),
      currentModelId: models.currentModelId,
      currentModeId: modes.currentModeId,
    };
  } finally {
    provider.cleanup();
  }
};
