import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type AvailableCommand,
  type Client,
} from '@agentclientprotocol/sdk';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { Readable, Writable } from 'node:stream';

import type { SlashCommand } from '../../../shared/acp.ts';

import { resolveProviderPreset } from '../repositories/provider-catalog-store.ts';
import { buildAgentLaunchCommand } from './agent-launch-command.pure.ts';
import { buildAgentProcessEnv } from './agent-process-env.ts';
import { resolveCommandPath } from './command-path.ts';

const COMMAND_UPDATE_WAIT_MS = 500;

const toSlashCommand = (command: AvailableCommand): SlashCommand => ({
  name: command.name,
  description: command.description,
  inputHint: command.input?.hint ?? null,
});

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForExit = async (agentProcess: ChildProcessWithoutNullStreams): Promise<void> => {
  if (agentProcess.exitCode !== null || agentProcess.signalCode !== null) {
    return;
  }

  await Promise.race([
    once(agentProcess, 'exit').then(() => undefined),
    new Promise((resolve) => {
      setTimeout(resolve, 500);
    }),
  ]);

  if (agentProcess.exitCode !== null || agentProcess.signalCode !== null) {
    return;
  }

  agentProcess.kill('SIGKILL');
  await once(agentProcess, 'exit');
};

const stopAgentProcess = async (agentProcess: ChildProcessWithoutNullStreams): Promise<void> => {
  agentProcess.stdin.destroy();
  agentProcess.stdout.destroy();
  agentProcess.stderr.destroy();

  if (agentProcess.exitCode === null && agentProcess.signalCode === null) {
    agentProcess.kill();
  }

  await waitForExit(agentProcess);
};

const toErrorWithStderr = (error: unknown, stderrChunks: readonly string[]): Error => {
  const stderrText = stderrChunks.join('').trim();
  const message = error instanceof Error ? error.message : String(error);

  if (stderrText.length === 0) {
    return error instanceof Error ? error : new Error(message);
  }

  return new Error(`${message}\n[agent stderr]\n${stderrText}`);
};

export const probeAgentSlashCommands = async (options: {
  readonly cwd: string;
  readonly presetId: string;
}): Promise<readonly SlashCommand[]> => {
  const preset = await resolveProviderPreset({ presetId: options.presetId });

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

  const agentProcess = spawn(launch.command, [...launch.args], {
    cwd: launch.cwd,
    env: launch.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(process.platform === 'win32' ? { windowsHide: true } : {}),
  });
  const stderrChunks: string[] = [];
  let commands: readonly SlashCommand[] = [];

  agentProcess.stderr.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk.toString('utf8'));
  });

  if (agentProcess.stdin === null || agentProcess.stdout === null) {
    await stopAgentProcess(agentProcess);
    throw new Error('Failed to spawn agent process with stdio');
  }

  const client: Client = {
    requestPermission: () =>
      Promise.resolve({
        outcome: {
          outcome: 'cancelled',
        },
      }),
    sessionUpdate: (params) => {
      if (params.update.sessionUpdate === 'available_commands_update') {
        commands = params.update.availableCommands.map(toSlashCommand);
      }
      return Promise.resolve();
    },
  };

  const connection = new ClientSideConnection(
    () => client,
    ndJsonStream(Writable.toWeb(agentProcess.stdin), Readable.toWeb(agentProcess.stdout)),
  );

  try {
    await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false,
        },
        terminal: false,
      },
    });
    await connection.newSession({
      cwd: launch.cwd,
      mcpServers: [],
    });
    await wait(COMMAND_UPDATE_WAIT_MS);

    return commands;
  } catch (error) {
    throw toErrorWithStderr(error, stderrChunks);
  } finally {
    await stopAgentProcess(agentProcess);
  }
};
